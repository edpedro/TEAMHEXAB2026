import { IsString, IsOptional } from 'class-validator';

export class SendTestDto {
  @IsString()
  @IsOptional()
  message?: string;
}
