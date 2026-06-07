import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 3000);

  const envOrigins = (configService.get<string>("FRONTEND_URL", "") || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:4173",
    "http://192.168.0.109:5173",
    "https://teamhexaf-2026.vercel.app",
  ];
  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
      }
    },
    credentials: true,
  });

  const uploadsPath = join(process.cwd(), "uploads");
  const receiptsPath = join(uploadsPath, "receipts");
  for (const dir of [uploadsPath, receiptsPath]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  app.useStaticAssets(uploadsPath, { prefix: "/uploads" });

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? port, "0.0.0.0");
  console.log(`🚀 TEAMHEXA2026 rodando em http://localhost:${port}`);
}

bootstrap();
