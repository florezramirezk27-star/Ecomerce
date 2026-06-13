import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class UploadService {
  private readonly useCloudinary: boolean;
  private readonly useS3: boolean;
  private readonly s3Client?: S3Client;
  private readonly bucketName?: string;
  private readonly awsRegion?: string;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const cloudKey = process.env.CLOUDINARY_API_KEY;
    const cloudSecret = process.env.CLOUDINARY_API_SECRET;
    const cloudUrl = process.env.CLOUDINARY_URL;

    this.useCloudinary = !!(
      cloudUrl ||
      (cloudName && cloudKey && cloudSecret)
    );

    if (this.useCloudinary) {
      const cloudinaryConfig: Record<string, string | boolean> = {
        secure: true,
      };

      if (cloudName) cloudinaryConfig.cloud_name = cloudName;
      if (cloudKey) cloudinaryConfig.api_key = cloudKey;
      if (cloudSecret) cloudinaryConfig.api_secret = cloudSecret;

      cloudinary.config(cloudinaryConfig);
    }

    this.bucketName = process.env.AWS_S3_BUCKET;
    this.awsRegion = process.env.AWS_REGION;
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.useS3 = !!(
      this.bucketName &&
      this.awsRegion &&
      awsAccessKey &&
      awsSecretKey
    );

    if (this.useS3) {
      this.s3Client = new S3Client({
        region: this.awsRegion,
        credentials: {
          accessKeyId: awsAccessKey!,
          secretAccessKey: awsSecretKey!,
        },
      });
    }
  }

  async uploadFile(file: UploadedImageFile) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }

    if (this.useCloudinary) {
      return this.uploadToCloudinary(file);
    }

    if (this.useS3) {
      return this.uploadToS3(file);
    }

    throw new BadRequestException(
      'No se ha configurado un proveedor de carga. Configura Cloudinary o AWS S3.',
    );
  }

  private uploadToCloudinary(
    file: UploadedImageFile,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'ecommerce/products',
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            return reject(
              new InternalServerErrorException(
                'Error al subir la imagen a Cloudinary.',
              ),
            );
          }

          if (!result?.secure_url) {
            return reject(
              new InternalServerErrorException(
                'No se obtuvo URL de Cloudinary.',
              ),
            );
          }

          resolve(result.secure_url);
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  private async uploadToS3(
    file: UploadedImageFile,
  ): Promise<string> {
    if (!this.s3Client || !this.bucketName || !this.awsRegion) {
      throw new InternalServerErrorException(
        'S3 no está configurado correctamente.',
      );
    }

    const sanitizedFilename = file.originalname
      .trim()
      .replace(/\s+/g, '_');
    const key = `products/${Date.now()}-${randomUUID()}-${sanitizedFilename}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    return `https://${this.bucketName}.s3.${this.awsRegion}.amazonaws.com/${key}`;
  }
}
