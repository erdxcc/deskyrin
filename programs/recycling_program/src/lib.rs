//! Партнёр держит пул USDC (ATA под PDA `program_authority`).
//! После скана QR бэкенд подписывает `mint_bottle_nft`: 1 SPL на бутылку в escrow-PDA + `BottleRecord`.
//! Сдача: подписывает только бэкенд — burn из escrow через seeds PDA, USDC на ATA кастодиального кошелька пользователя.
//! Конечному пользователю не нужен кошелёк в телефоне: ключ от `custodial_user` хранит сервис.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi");

pub const PROGRAM_AUTHORITY_SEED: &[u8] = b"program_authority";
pub const POOL_STATE_SEED: &[u8] = b"pool_state";
pub const BOTTLE_SEED: &[u8] = b"bottle";
/// PDA-владелец токена бутылки до утилизации (программа подписывает burn).
pub const BOTTLE_ESCROW_SEED: &[u8] = b"bottle_escrow";

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
        let escrow_seeds: &[&[u8]] = &[
            BOTTLE_ESCROW_SEED,
            ctx.accounts.bottle_mint.key().as_ref(),
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
        mut,
        init_if_needed,
        payer = partner,
        associated_token::mint = usdc_mint,
        associated_token::authority = program_authority,
        associated_token::token_program = token_program,
    )]
    pub reward_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(seeds = [PROGRAM_AUTHORITY_SEED], bump)]
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
        mut,
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
}
