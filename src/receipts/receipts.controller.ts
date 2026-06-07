import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { unlink } from 'fs/promises';
import { ReceiptsService } from './receipts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  private readonly logger = new Logger(ReceiptsController.name);

  constructor(private receiptsService: ReceiptsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'receipts'),
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Formato inválido. Use PNG, JPG ou PDF'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('notes') notes: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }
    try {
      return await this.receiptsService.create({
        userId,
        filePath: file.path,
        fileName: file.originalname,
        mimeType: file.mimetype,
        notes,
      });
    } catch (error) {
      this.logger.error(`Erro ao salvar comprovante no banco: ${error.message}`);
      try {
        await unlink(file.path);
      } catch {
        this.logger.warn(`Não foi possível remover arquivo órfão: ${file.path}`);
      }
      throw new InternalServerErrorException(
        'Erro ao processar comprovante. Tente novamente.',
      );
    }
  }

  @Get('my')
  async myReceipts(@CurrentUser('id') userId: string) {
    return this.receiptsService.findByUser(userId);
  }
}
