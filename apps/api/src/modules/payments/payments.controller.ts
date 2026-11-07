import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditAdmin, SkipAudit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { ChapaService } from './chapa.service';
import { InitializeChapaDto } from './dto/initialize-chapa.dto';
import { VerifyReceiptDto } from './dto/verify-receipt.dto';
import {
  AddBankDto,
  SetBankAccountDto,
  UpdateBankDto,
} from './dto/manage-bank.dto';

import type { RequestUser } from '../../common/types/request-user';

const uploadDir = path.join(process.cwd(), 'uploads', 'receipts');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = diskStorage({
  destination: uploadDir,
  filename: (_req, file, callback) => {
    const randomName = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    callback(null, `${randomName}${ext}`);
  },
});

function fileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return callback(
      new BadRequestException('Only JPEG, PNG, or WEBP images are allowed'),
      false,
    );
  }
  callback(null, true);
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly chapa: ChapaService,
  ) {}

  // ── Admin moderation ──────────────────────────
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  findAllAdmin(
    @Query('status') status = '',
    @Query('search') search = '',
    @Query('exceptions') exceptions = '',
  ) {
    return this.service.findAllAdmin({
      status,
      search,
      exceptions: exceptions === 'true' || exceptions === '1',
    });
  }

  // ── Admin: accepted payment banks ─────────────
  // The catalog (codes/labels/auto-verify capability) lives in code; these
  // endpoints only manage which entries the college currently accepts.
  @Get('admin/banks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  listBankCatalog() {
    return this.service.listBankCatalog();
  }

  @Post('admin/banks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  addBank(@Body() dto: AddBankDto) {
    return this.service.addBank(dto.code);
  }

  @Patch('admin/banks/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateBank(@Param('code') code: string, @Body() dto: UpdateBankDto) {
    return this.service.updateBank(code, dto.isActive);
  }

  // College receiving account for an adopted bank. Full number, digit-only;
  // the service applies the bank's Cheki lookup rule (CBE 8 digits, BOA 5).
  @Patch('admin/banks/:code/account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  setBankAccount(
    @Param('code') code: string,
    @Body() dto: SetBankAccountDto,
  ) {
    return this.service.setBankAccount(code, dto);
  }

  @Delete('admin/banks/:code/account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  clearBankAccount(@Param('code') code: string) {
    return this.service.clearBankAccount(code);
  }

  @Delete('admin/banks/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  removeBank(@Param('code') code: string) {
    return this.service.removeBank(code);
  }

  // ── Student: my payment history ───────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: RequestUser) {
    return this.service.findMine(user.id);
  }

  // ── PUBLIC: college receiving accounts for direct transfers ──
  // Shown on the student payment page so the bank-transfer flow is
  // completable from the app alone (audit finding F-12). Account numbers are
  // printed on every bank receipt, so they are not secret.
  @Get('bank-accounts')
  getBankAccounts() {
    return this.service.getBankAccounts();
  }

  // ── PUBLIC: banks the college accepts (student picker) ──
  // Only enabled entries; whether a bank is auto-verifiable is returned so the
  // page can say "manual review" before the student submits.
  @Get('banks')
  getAcceptedBanks() {
    return this.service.getAcceptedBanks();
  }

  // ── MANUAL flow: upload bank receipt ──────────
  // The upload now also triggers a Cheki OCR scan (QR → bank reference), so
  // cap retries like the reference flow to stay inside the external quota.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage,
      fileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  submit(
    @Body('planId') planId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!planId) {
      throw new BadRequestException('planId is required');
    }
    return this.service.submit(user.id, planId, file);
  }

  // ── BANK-TRANSFER flow: verify a transaction reference ──
  // Hits an external scraper and creates a payment row, so cap retries like
  // the Chapa entry point.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  verify(@Body() dto: VerifyReceiptDto, @CurrentUser() user: RequestUser) {
    return this.service.verifyAndSubmit(user.id, dto);
  }

  // ── CHAPA flow: start an online payment ───────
  // Tighter limit than the global default — initializing a checkout hits an
  // external API and creates a payment row, so cap abusive retries.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('chapa/initialize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  initializeChapa(
    @Body() dto: InitializeChapaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chapa.initialize(user, dto.planId);
  }

  // Chapa calls callback_url with a GET after checkout. This endpoint does not
  // trust callback fields; it re-verifies the transaction with Chapa.
  @Get('chapa/callback')
  handleChapaCallback(
    @Query('trx_ref') trxRef?: string,
    @Query('tx_ref') txRef?: string,
  ) {
    const reference = txRef ?? trxRef;
    if (!reference) {
      throw new BadRequestException('Transaction reference is required');
    }
    return this.chapa.handleCallback(reference);
  }

  // ── CHAPA webhook (public; verified by HMAC signature) ──
  @Post('chapa/webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.chapa.handleWebhook(raw, {
      chapaSignature: req.headers['chapa-signature'] as string | undefined,
      payloadSignature: req.headers['x-chapa-signature'] as string | undefined,
    });
  }

  // ── CHAPA: confirm status from the browser callback ──
  @Get('chapa/verify/:txRef')
  @UseGuards(JwtAuthGuard)
  verifyChapa(@Param('txRef') txRef: string, @CurrentUser() user: RequestUser) {
    return this.chapa.verifyByTxRef(txRef, user.id);
  }

  // ── Student: cancel their own PENDING online (Chapa) payment ──
  // The gateway is asked first (PUT /transaction/cancel); the row changes only
  // after Chapa confirms the link is dead. Owner-checked in the service.
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @SkipAudit()
  cancelMine(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.chapa.cancelByStudent(id, user.id);
  }

  // These handlers write their own PAYMENT_* audit records with review
  // metadata, so suppress the generic interceptor entry.
  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @SkipAudit()
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.id);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @SkipAudit()
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reject(id, user.id, reason);
  }

  // SUPER_ADMIN only: invalidate a previously approved payment. Removes the
  // student's access when no other approved payment keeps the subscription
  // alive. A reason is mandatory.
  @Patch(':id/reverse')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @SkipAudit()
  reverse(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reverse(id, user.id, reason);
  }

  // ── Admin: view the uploaded MANUAL receipt image ──
  // Receipt views expose a student's payment evidence, so log the access.
  @Get(':id/receipt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @AuditAdmin({ read: true })
  async getReceipt(@Param('id') id: string, @Res() res: Response) {
    const { fullPath, mimeType } = await this.service.getReceiptPath(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(fullPath);
  }

  // ── Owner or admin: download the generated PDF receipt ──
  @Get(':id/document')
  @UseGuards(JwtAuthGuard)
  @AuditAdmin({ read: true })
  async getDocument(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const fullPath = await this.service.getReceiptDocumentPath(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="receipt-${id}.pdf"`,
    );
    res.sendFile(fullPath);
  }
}
