/**
 * R2 Storage Service
 * Handles file uploads to Cloudflare R2 via API route
 */

const UPLOAD_API_URL = '/api/upload';

export interface UploadResult {
    success: boolean;
    url?: string;
    fileName?: string;
    error?: string;
}

/**
 * Upload an image file to R2
 */
export async function uploadImage(file: File): Promise<UploadResult> {
    return uploadFile(file, 'image');
}

/**
 * Upload a voice message blob to R2
 */
export async function uploadVoice(blob: Blob): Promise<UploadResult> {
    // Convert Blob to File for FormData
    const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
    return uploadFile(file, 'voice');
}

/**
 * Generic file upload function
 */
async function uploadFile(file: File, type: 'image' | 'voice'): Promise<UploadResult> {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);

        const response = await fetch(UPLOAD_API_URL, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        const data = await response.json();
        return {
            success: true,
            url: data.url,
            fileName: data.fileName,
        };

    } catch (error) {
        console.error('Upload error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
        };
    }
}
