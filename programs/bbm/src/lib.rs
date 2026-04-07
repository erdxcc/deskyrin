//! Партнёр держит пул USDC (ATA под PDA `program_authority`).
//! После скана QR бэкенд подписывает `mint_bottle_nft`: 1 SPL на бутылку в escrow-PDA + `BottleRecord`.
//! Сдача: подписывает только бэкенд — burn из escrow через seeds PDA, USDC на ATA кастодиального кошелька пользователя.
//! Конечному пользователю не нужен кошелёк в телефоне: ключ от `custodial_user` хранит сервис.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::clock::Clock;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi");

pub const PROGRAM_AUTHORITY_SEED: &[u8] = b"program_authority";
pub const POOL_STATE_SEED: &[u8] = b"pool_state";
pub const BOTTLE_SEED: &[u8] = b"bottle";
/// PDA-владелец токена бутылки до утилизации (программа подписывает burn).
pub const BOTTLE_ESCROW_SEED: &[u8] = b"bottle_escrow";

/// Deskyrin AC/PT staking (separate from bottle flow).
pub const DESKYRIN_CFG_SEED: &[u8] = b"deskyrin_cfg";
pub const STAKE_POS_SEED: &[u8] = b"stake";

/// Raw AC (6 decimals) per `faucet_ac` tx caps — devnet / QA only.
pub const MAX_FAUCET_AC_PER_TX: u64 = 100_000_000;

#[program]
pub mod recycling_program {
    use super::*;

    pub fn fund_reward_pool(ctx: Context<FundRewardPool>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        let pool = &mut ctx.accounts.pool_state;
        if pool.partner == Pubkey::default() {
            pool.partner = ctx.accounts.partner.key();
            pool.bump = ctx.bumps.pool_state;
            pool.total_deposited = 0;
            pool.total_distributed = 0;
        }
        require_keys_eq!(pool.partner, ctx.accounts.partner.key());

        require_keys_eq!(
            ctx.accounts.partner_usdc_account.owner,
            ctx.accounts.partner.key()
        );
        require_keys_eq!(
            ctx.accounts.partner_usdc_account.mint,
            ctx.accounts.usdc_mint.key()
        );
        require_keys_eq!(
            ctx.accounts.reward_pool_usdc.mint,
            ctx.accounts.usdc_mint.key()
        );

        pool.total_deposited = pool
            .total_deposited
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.partner_usdc_account.to_account_info(),
                to: ctx.accounts.reward_pool_usdc.to_account_info(),
                authority: ctx.accounts.partner.to_account_info(),
            },
        );
        token::transfer(cpi, amount)?;

        Ok(())
    }

    /// `custodial_user` — pubkey кошелька пользователя на сервере (пользователь его не импортирует).
    pub fn mint_bottle_nft(
        ctx: Context<MintBottleNft>,
        bottle_id: String,
        reward_amount: u64,
        _name: String,
        _uri: String,
        custodial_user: Pubkey,
    ) -> Result<()> {
        require!(reward_amount > 0, ErrorCode::InvalidAmount);
        let blen = bottle_id.as_bytes().len();
        require!(blen > 0 && blen <= 32, ErrorCode::InvalidBottleId);
        require!(custodial_user != Pubkey::default(), ErrorCode::InvalidCustodialUser);

        require_keys_eq!(
            ctx.accounts.backend_signer.key(),
            ctx.accounts.pool_state.partner
        );

        let mut id_bytes = [0u8; 32];
        id_bytes[..blen].copy_from_slice(bottle_id.as_bytes());

        let bottle = &mut ctx.accounts.bottle_record;
        bottle.partner = ctx.accounts.pool_state.partner;
        bottle.owner = custodial_user;
        bottle.mint = ctx.accounts.bottle_mint.key();
        bottle.reward_amount = reward_amount;
        bottle.is_recycled = false;
        bottle.bump = ctx.bumps.bottle_record;
        bottle.bottle_id = id_bytes;

        let bump = ctx.bumps.program_authority;
        let seeds: &[&[u8]] = &[PROGRAM_AUTHORITY_SEED, &[bump]];
        let signer = &[seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.bottle_mint.to_account_info(),
                    to: ctx.accounts.escrow_bottle_ata.to_account_info(),
                    authority: ctx.accounts.program_authority.to_account_info(),
                },
                signer,
            ),
            1,
        )?;

        Ok(())
    }

    /// Утилизация: только `backend_signer` (партнёр/бэкенд). Пользователь в транзакции не подписывает.
    pub fn recycle_bottle(ctx: Context<RecycleBottle>, bottle_id: String) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.backend_signer.key(),
            ctx.accounts.pool_state.partner
        );

        let blen = bottle_id.as_bytes().len();
        require!(blen > 0 && blen <= 32, ErrorCode::InvalidBottleId);
        let mut expected_id = [0u8; 32];
        expected_id[..blen].copy_from_slice(bottle_id.as_bytes());

        let bottle = &ctx.accounts.bottle_record;
        require!(bottle.bottle_id == expected_id, ErrorCode::BottleIdMismatch);
        require!(!bottle.is_recycled, ErrorCode::AlreadyRecycled);
        require_keys_eq!(bottle.mint, ctx.accounts.bottle_mint.key());
        require_keys_eq!(bottle.owner, ctx.accounts.custodial_user.key());
        require_keys_eq!(bottle.partner, ctx.accounts.pool_state.partner);

        let escrow_ata = &ctx.accounts.escrow_bottle_ata;
        require_keys_eq!(escrow_ata.owner, ctx.accounts.bottle_escrow.key());
        require_keys_eq!(escrow_ata.mint, ctx.accounts.bottle_mint.key());
        require!(escrow_ata.amount == 1, ErrorCode::InvalidBottleBalance);

        require_keys_eq!(
            ctx.accounts.reward_pool_usdc.mint,
            ctx.accounts.usdc_mint.key()
        );
        require_keys_eq!(
            ctx.accounts.user_usdc_ata.mint,
            ctx.accounts.usdc_mint.key()
        );
        require_keys_eq!(
            ctx.accounts.user_usdc_ata.owner,
            ctx.accounts.custodial_user.key()
        );

        let reward = bottle.reward_amount;
        require!(
            ctx.accounts.reward_pool_usdc.amount >= reward,
            ErrorCode::InsufficientPoolBalance
        );

        let bump_escrow = ctx.bumps.bottle_escrow;
        let bottle_mint_key = ctx.accounts.bottle_mint.key();
        let escrow_seeds: &[&[u8]] = &[
            BOTTLE_ESCROW_SEED,
            bottle_mint_key.as_ref(),
            &[bump_escrow],
        ];

        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.bottle_mint.to_account_info(),
                    from: ctx.accounts.escrow_bottle_ata.to_account_info(),
                    authority: ctx.accounts.bottle_escrow.to_account_info(),
                },
                &[escrow_seeds],
            ),
            1,
        )?;

        let bump = ctx.bumps.program_authority;
        let auth_seeds: &[&[u8]] = &[PROGRAM_AUTHORITY_SEED, &[bump]];
        let signer = &[auth_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.reward_pool_usdc.to_account_info(),
                    to: ctx.accounts.user_usdc_ata.to_account_info(),
                    authority: ctx.accounts.program_authority.to_account_info(),
                },
                signer,
            ),
            reward,
        )?;

        let pool = &mut ctx.accounts.pool_state;
        pool.total_distributed = pool
            .total_distributed
            .checked_add(reward)
            .ok_or(ErrorCode::MathOverflow)?;

        let bottle_mut = &mut ctx.accounts.bottle_record;
        bottle_mut.is_recycled = true;

        Ok(())
    }

    /// One-time: AC + PT mints + vault (payer = partner / backend).
    pub fn setup_deskyrin_staking(ctx: Context<SetupDeskyrinStaking>) -> Result<()> {
        let cfg = &mut ctx.accounts.deskyrin_config;
        cfg.ac_mint = ctx.accounts.ac_mint.key();
        cfg.pt_mint = ctx.accounts.pt_mint.key();
        cfg.vault_ac = ctx.accounts.vault_ac.key();
        cfg.bump = ctx.bumps.deskyrin_config;
        Ok(())
    }

    /// Lock AC in vault for `lock_days`; PT unlocks linearly until maturity (matches off-chain curve).
    pub fn stake_ac_locked(
        ctx: Context<StakeAcLocked>,
        stake_idx: u64,
        amount: u64,
        lock_days: u16,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            matches!(lock_days, 7 | 14 | 30 | 60 | 90),
            ErrorCode::InvalidLockDays
        );

        let now = Clock::get()?.unix_timestamp;
        let period_secs: i64 = i64::from(lock_days) * 86_400;
        let maturity = now.checked_add(period_secs).ok_or(ErrorCode::MathOverflow)?;

        let total_pt = total_pt_entitled(amount, lock_days)?;

        let st = &mut ctx.accounts.stake_position;
        st.user = ctx.accounts.user.key();
        st.stake_idx = stake_idx;
        st.amount_ac = amount;
        st.lock_days = lock_days;
        st.start_ts = now;
        st.maturity_ts = maturity;
        st.total_pt = total_pt;
        st.claimed_pt = 0;
        st.bump = ctx.bumps.stake_position;

        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_ac_ata.to_account_info(),
                to: ctx.accounts.vault_ac.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(cpi, amount)?;

        Ok(())
    }

    /// Claim vested PT (linear vesting over lock period).
    pub fn claim_vested_pt(ctx: Context<ClaimVestedPt>, stake_idx: u64) -> Result<()> {
        require_keys_eq!(ctx.accounts.stake_position.user, ctx.accounts.user.key());
        require!(ctx.accounts.stake_position.stake_idx == stake_idx, ErrorCode::StakeIdxMismatch);

        let st = &mut ctx.accounts.stake_position;
        let now = Clock::get()?.unix_timestamp;
        let claimable = claimable_pt_linear(
            st.total_pt,
            st.claimed_pt,
            st.start_ts,
            st.maturity_ts,
            now,
        )?;
        require!(claimable > 0, ErrorCode::NothingToClaim);

        st.claimed_pt = st
            .claimed_pt
            .checked_add(claimable)
            .ok_or(ErrorCode::MathOverflow)?;

        let bump = ctx.bumps.program_authority;
        let seeds: &[&[u8]] = &[PROGRAM_AUTHORITY_SEED, &[bump]];
        let signer = &[seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.pt_mint.to_account_info(),
                    to: ctx.accounts.user_pt_ata.to_account_info(),
                    authority: ctx.accounts.program_authority.to_account_info(),
                },
                signer,
            ),
            claimable,
        )?;

        Ok(())
    }

    /// Mint AC to the caller's ATA (devnet faucet). Caller pays rent if ATA is created.
    pub fn faucet_ac(ctx: Context<FaucetAc>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            amount <= MAX_FAUCET_AC_PER_TX,
            ErrorCode::FaucetAmountTooLarge
        );

        let bump = ctx.bumps.program_authority;
        let seeds: &[&[u8]] = &[PROGRAM_AUTHORITY_SEED, &[bump]];
        let signer = &[seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.ac_mint.to_account_info(),
                    to: ctx.accounts.user_ac_ata.to_account_info(),
                    authority: ctx.accounts.program_authority.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        Ok(())
    }
}

fn total_pt_entitled(ac: u64, lock_days: u16) -> Result<u64> {
    let mult_bps: u64 = match lock_days {
        7 => 11_000,
        14 => 12_500,
        30 => 15_000,
        60 => 20_000,
        90 => 27_500,
        _ => return Err(ErrorCode::InvalidLockDays.into()),
    };
    Ok(ac
        .saturating_mul(mult_bps)
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?)
}

fn claimable_pt_linear(
    total_pt: u64,
    claimed: u64,
    start_ts: i64,
    maturity_ts: i64,
    now: i64,
) -> Result<u64> {
    let vested = vested_pt_linear(total_pt, start_ts, maturity_ts, now)?;
    Ok(vested.saturating_sub(claimed))
}

fn vested_pt_linear(total: u64, start: i64, maturity: i64, now: i64) -> Result<u64> {
    if now <= start {
        return Ok(0);
    }
    if now >= maturity {
        return Ok(total);
    }
    let num = (now - start) as u128;
    let den = (maturity - start) as u128;
    if den == 0 {
        return Ok(total);
    }
    Ok(((total as u128)
        .saturating_mul(num)
        .checked_div(den)
        .ok_or(ErrorCode::MathOverflow)?) as u64)
}

#[derive(Accounts)]
pub struct SetupDeskyrinStaking<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + DeskyrinConfig::INIT_SPACE,
        seeds = [DESKYRIN_CFG_SEED],
        bump
    )]
    pub deskyrin_config: Account<'info, DeskyrinConfig>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = program_authority,
        mint::freeze_authority = program_authority,
        mint::token_program = token_program,
    )]
    pub ac_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = program_authority,
        mint::freeze_authority = program_authority,
        mint::token_program = token_program,
    )]
    pub pt_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = ac_mint,
        associated_token::authority = program_authority,
        associated_token::token_program = token_program,
    )]
    pub vault_ac: Account<'info, TokenAccount>,

    #[account(seeds = [PROGRAM_AUTHORITY_SEED], bump)]
    /// CHECK: PDA signer; constrained by fixed seed+bump and used only as program authority.
    pub program_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(stake_idx: u64)]
pub struct StakeAcLocked<'info> {
    #[account(seeds = [DESKYRIN_CFG_SEED], bump)]
    pub deskyrin_config: Account<'info, DeskyrinConfig>,

    #[account(
        init,
        payer = user,
        space = 8 + StakePosition::INIT_SPACE,
        seeds = [STAKE_POS_SEED, user.key().as_ref(), &stake_idx.to_le_bytes()],
        bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = user_ac_ata.owner == user.key(),
        constraint = user_ac_ata.mint == deskyrin_config.ac_mint
    )]
    pub user_ac_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_ac.key() == deskyrin_config.vault_ac
    )]
    pub vault_ac: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(stake_idx: u64)]
pub struct ClaimVestedPt<'info> {
    #[account(seeds = [DESKYRIN_CFG_SEED], bump)]
    pub deskyrin_config: Account<'info, DeskyrinConfig>,

    #[account(
        mut,
        seeds = [STAKE_POS_SEED, user.key().as_ref(), &stake_idx.to_le_bytes()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = pt_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_pt_ata: Account<'info, TokenAccount>,

    #[account(mut, constraint = pt_mint.key() == deskyrin_config.pt_mint)]
    pub pt_mint: Account<'info, Mint>,

    #[account(seeds = [PROGRAM_AUTHORITY_SEED], bump)]
    /// CHECK: PDA signer; constrained by fixed seed+bump and used only as mint authority.
    pub program_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FaucetAc<'info> {
    #[account(seeds = [DESKYRIN_CFG_SEED], bump)]
    pub deskyrin_config: Account<'info, DeskyrinConfig>,

    #[account(mut, constraint = ac_mint.key() == deskyrin_config.ac_mint)]
    pub ac_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = ac_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_ac_ata: Account<'info, TokenAccount>,

    #[account(seeds = [PROGRAM_AUTHORITY_SEED], bump)]
    /// CHECK: PDA signer; mint authority for AC.
    pub program_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct DeskyrinConfig {
    pub ac_mint: Pubkey,
    pub pt_mint: Pubkey,
    pub vault_ac: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakePosition {
    pub user: Pubkey,
    pub stake_idx: u64,
    pub amount_ac: u64,
    pub lock_days: u16,
    pub start_ts: i64,
    pub maturity_ts: i64,
    pub total_pt: u64,
    pub claimed_pt: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct FundRewardPool<'info> {
    #[account(mut)]
    pub partner: Signer<'info>,

    #[account(
        init_if_needed,
        payer = partner,
        space = 8 + PoolState::INIT_SPACE,
        seeds = [POOL_STATE_SEED, partner.key().as_ref()],
        bump
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(mut)]
    pub partner_usdc_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = partner,
        associated_token::mint = usdc_mint,
        associated_token::authority = program_authority,
        associated_token::token_program = token_program,
    )]
    pub reward_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(seeds = [PROGRAM_AUTHORITY_SEED], bump)]
    /// CHECK: PDA signer; constrained by fixed seed+bump and used only as vault authority.
    pub program_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bottle_id: String)]
pub struct MintBottleNft<'info> {
    #[account(
        mut,
        seeds = [POOL_STATE_SEED, pool_state.partner.as_ref()],
        bump = pool_state.bump
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        init,
        payer = backend_signer,
        space = 8 + BottleRecord::INIT_SPACE,
        seeds = [BOTTLE_SEED, bottle_id.as_bytes()],
        bump
    )]
    pub bottle_record: Account<'info, BottleRecord>,

    #[account(
        init,
        payer = backend_signer,
        mint::decimals = 0,
        mint::authority = program_authority,
        mint::freeze_authority = program_authority,
        mint::token_program = token_program,
    )]
    pub bottle_mint: Account<'info, Mint>,

    #[account(
        seeds = [BOTTLE_ESCROW_SEED, bottle_mint.key().as_ref()],
        bump
    )]
    /// CHECK: PDA owner of escrow ATA; authority is validated via seeds and ATA constraints.
    pub bottle_escrow: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = backend_signer,
        associated_token::mint = bottle_mint,
        associated_token::authority = bottle_escrow,
        associated_token::token_program = token_program,
    )]
    pub escrow_bottle_ata: Account<'info, TokenAccount>,

    #[account(seeds = [PROGRAM_AUTHORITY_SEED], bump)]
    /// CHECK: PDA signer; constrained by fixed seed+bump and used as bottle mint authority.
    pub program_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub backend_signer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bottle_id: String)]
pub struct RecycleBottle<'info> {
    #[account(
        mut,
        seeds = [POOL_STATE_SEED, pool_state.partner.as_ref()],
        bump = pool_state.bump
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        mut,
        seeds = [BOTTLE_SEED, bottle_id.as_bytes()],
        bump
    )]
    pub bottle_record: Account<'info, BottleRecord>,

    #[account(
        mut,
        constraint = bottle_record.mint == bottle_mint.key() @ ErrorCode::BottleMintMismatch
    )]
    pub bottle_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [BOTTLE_ESCROW_SEED, bottle_mint.key().as_ref()],
        bump
    )]
    /// CHECK: PDA owner of escrow ATA; validated by seeds and escrow ATA constraints.
    pub bottle_escrow: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = escrow_bottle_ata.owner == bottle_escrow.key() @ ErrorCode::EscrowMismatch,
        constraint = escrow_bottle_ata.mint == bottle_mint.key() @ ErrorCode::EscrowMismatch,
    )]
    pub escrow_bottle_ata: Account<'info, TokenAccount>,

    #[account(constraint = custodial_user.key() == bottle_record.owner @ ErrorCode::CustodialUserMismatch)]
    /// CHECK: кастодиальный кошелёк (ключ у бэкенда).
    pub custodial_user: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = backend_signer,
        associated_token::mint = usdc_mint,
        associated_token::authority = custodial_user,
        associated_token::token_program = token_program,
    )]
    pub user_usdc_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub reward_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(seeds = [PROGRAM_AUTHORITY_SEED], bump)]
    /// CHECK: PDA signer; constrained by fixed seed+bump and used as reward pool authority.
    pub program_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub backend_signer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct PoolState {
    pub partner: Pubkey,
    pub total_deposited: u64,
    pub total_distributed: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BottleRecord {
    pub partner: Pubkey,
    /// Кастодиальный кошелёк пользователя (USDC сюда при recycle).
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub reward_amount: u64,
    pub is_recycled: bool,
    pub bump: u8,
    pub bottle_id: [u8; 32],
}

#[error_code]
pub enum ErrorCode {
    #[msg("Сумма должна быть больше нуля.")]
    InvalidAmount,
    #[msg("Некорректный идентификатор бутылки (1–32 байта).")]
    InvalidBottleId,
    #[msg("Некорректный кастодиальный пользователь.")]
    InvalidCustodialUser,
    #[msg("Бутылка уже утилизирована.")]
    AlreadyRecycled,
    #[msg("В escrow должна быть ровно 1 единица токена бутылки.")]
    InvalidBottleBalance,
    #[msg("Недостаточно USDC в пуле вознаграждений.")]
    InsufficientPoolBalance,
    #[msg("Переполнение при арифметике.")]
    MathOverflow,
    #[msg("Mint не совпадает с записью бутылки.")]
    BottleMintMismatch,
    #[msg("Параметр bottle_id не совпадает с записью на чейне.")]
    BottleIdMismatch,
    #[msg("Escrow ATA не совпадает с mint / PDA.")]
    EscrowMismatch,
    #[msg("Аккаунт custodial_user не совпадает с записью бутылки.")]
    CustodialUserMismatch,
    #[msg("Недопустимый срок блокировки (7, 14, 30, 60, 90 дней).")]
    InvalidLockDays,
    #[msg("Несовпадение индекса стейка.")]
    StakeIdxMismatch,
    #[msg("Пока нечего клеймить.")]
    NothingToClaim,
    #[msg("Faucet amount exceeds per-transaction cap.")]
    FaucetAmountTooLarge,
}
