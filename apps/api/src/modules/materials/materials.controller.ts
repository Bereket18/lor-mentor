import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import * as path from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MaterialsService } from './materials.service';
import {
  CreateMaterialDto,
  MaterialTypeInput,
} from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

interface AuthUser {
  id: string;
  role: string;
}

// Multer storage configuration — where and how uploaded files are saved
const storage = diskStorage({
  destination: path.join(process.cwd(), 'uploads', 'materials'),
  filename: (req, file, callback) => {
    // Generate a random filename — NEVER trust the original filename
    // (it could contain malicious characters or be used to guess
    // other files). Keep only the original extension.
    const randomName = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    callback(null, `${randomName}${ext}`);
  },
});

// Only allow specific file types — reject everything else immediately
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fileFilter(req: any, file: Express.Multer.File, callback: any) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return callback(
      new BadRequestException('Only PDF, JPEG, PNG, or WEBP files are allowed'),
      false,
    );
  }
  callback(null, true);
}

@Controller('materials')
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  // GET /api/v1/materials?courseId=xxx
  @Get()
  @UseGuards(JwtAuthGuard)
  findByCourse(@Query('courseId') courseId: string) {
    return this.service.findByCourse(courseId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ── THE SECURE FILE SERVING ENDPOINT ────────────────────────────
  // GET /api/v1/materials/:id/file
  // This is the ONLY way to actually retrieve file bytes
  @Get(':id/file')
  @UseGuards(JwtAuthGuard)
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { fullPath, mimeType } = await this.service.getFilePathForStudent(
      id,
      user.id,
    );

    // Stream the file directly — never load the whole thing into memory
    res.setHeader('Content-Type', mimeType);
    // 'inline' = browser displays it; 'attachment' would force a download.
    // We use inline + we never include a download-friendly filename,
    // making casual downloading slightly harder (full prevention
    // requires more advanced PDF.js viewer restrictions — future sprint)
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(fullPath);
  }

  // POST /api/v1/materials/upload — PDF or IMAGE
  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      fileFilter,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @Body() dto: CreateMaterialDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createWithFile(dto, file, user.id);
  }

  // POST /api/v1/materials/youtube
  @Post('youtube')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  createYoutube(@Body() dto: CreateMaterialDto, @CurrentUser() user: AuthUser) {
    return this.service.createYoutube(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
