/**
 * R2 Upload API Route
 * Handles file uploads to Cloudflare R2 using S3-compatible API
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// Initialize S3 client for R2
const getR2Client = () => {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error('Missing R2 environment variables');
    }

    return new S3Client({
        region: 'auto',
        endpoint: endpoint,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
        // Cloudflare R2 works best with path-style access for custom endpoints
        forcePathStyle: true,
    });
};

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'whisper-assets';
const PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL || ''; // e.g., https://assets.yourdomain.com

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const fileType = formData.get('type') as string || 'image'; // 'image' or 'voice'

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file size (10MB for images, 5MB for voice)
        const maxSize = fileType === 'voice' ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
        if (file.size > maxSize) {
            return NextResponse.json({ error: 'File too large' }, { status: 413 });
        }

        // Generate file path
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const extension = fileType === 'voice' ? 'webm' : getExtension(file.name, file.type);
        const folder = fileType === 'voice' ? 'voice_messages' : 'chat_images';
        const fileName = `${folder}/${timestamp}_${randomId}.${extension}`;

        // Convert file to Uint8Array (Standard Web API compatible with Edge Runtime)
        const arrayBuffer = await file.arrayBuffer();
        const fileBytes = new Uint8Array(arrayBuffer);

        // Initialize client and upload
        const R2 = getR2Client();
        await R2.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: fileBytes,
            ContentType: file.type || 'application/octet-stream',
        }));

        // Return public URL
        // Ensure PUBLIC_URL_BASE doesn't end with a slash if fileName doesn't start with one
        const baseUrl = PUBLIC_URL_BASE.endsWith('/') ? PUBLIC_URL_BASE.slice(0, -1) : PUBLIC_URL_BASE;
        const publicUrl = baseUrl ? `${baseUrl}/${fileName}` : `/${fileName}`;

        return NextResponse.json({
            success: true,
            url: publicUrl,
            fileName: fileName,
        });

    } catch (error) {
        console.error('R2 upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

function getExtension(filename: string, mimeType: string): string {
    // Try to get from filename first
    const fromName = filename.split('.').pop()?.toLowerCase();
    if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
        return fromName;
    }

    // Fallback to mime type
    const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'audio/webm': 'webm',
        'audio/mp4': 'mp4',
    };
    return mimeMap[mimeType] || 'bin';
}
