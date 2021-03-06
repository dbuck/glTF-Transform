import { vec2 } from '../constants';
import { BufferUtils } from './buffer-utils';

// Used to detect "fried" png's: http://www.jongware.com/pngdefry.html
const PNG_FRIED_CHUNK_NAME = 'CgBI';

/*
 * PNG signature: 'PNG\r\n\x1a\n'
 * PNG image header chunk name: 'IHDR'
 */

/**
 * # ImageUtils
 *
 * *Common utilities for working with image data.*
 *
 * @category Utilities
 */
class ImageUtils {
	/** Returns the dimensions of the image. */
	public static getSize (buffer: ArrayBuffer, mimeType: string): vec2 {
		switch (mimeType) {
			case 'image/png': return this._getSizePNG(buffer);
			case 'image/jpeg': return this._getSizeJPEG(buffer);
			case 'image/webp': return this._getSizeWebP(buffer);
			case 'image/ktx2': return this._getSizeKTX2(buffer);
			default: return null;
		}
	}

	/**
	 * Returns a conservative estimate of the number of channels in the image. For some image
	 * formats, the method may return 4 indicating the possibility of an alpha channel, without
	 * the ability to guarantee that an alpha channel is present.
	 */
	public static getChannels (buffer: ArrayBuffer, mimeType: string): number {
		switch (mimeType) {
			case 'image/png': return 4;
			case 'image/jpeg': return 3;
			case 'image/webp': return 4;
			case 'image/ktx2': return 4;
			default: return 4;
		}
	}

	/** Returns a conservative estimate of the GPU memory required by this image. */
	public static getMemSize (buffer: ArrayBuffer, mimeType: string): number {
		if (mimeType === 'image/ktx2') {
			const view = new DataView(buffer);
			validateKTX2Buffer(view);

			const levelCount = view.getUint32(12 + 7 * 4, true);
			const levelsOffset = 12 + 17 * 4;

			let uncompressedBytes = 0;
			for (let i = 0; i < levelCount; i++) {
				// UASTC uses level.uncompressedByteLength, ETC1S uses level.byteLength.
				uncompressedBytes += getUint64(view, levelsOffset + i * 3 * 8 + 16, true)
					|| getUint64(view, levelsOffset + i * 3 * 8 + 8, true);
			}
			return uncompressedBytes;
		}

		const resolution = this.getSize(buffer, mimeType);
		if (!resolution) return null;

		let uncompressedBytes = 0;
		const channels = 4; // See https://github.com/donmccurdy/glTF-Transform/issues/151.
		while (resolution[0] > 1 || resolution[1] > 1) {
			uncompressedBytes += resolution[0] * resolution[1] * channels;
			resolution[0] = Math.max(Math.floor(resolution[0] / 2), 1);
			resolution[1] = Math.max(Math.floor(resolution[1] / 2), 1);
		}
		uncompressedBytes += 1 * 1 * channels;
		return uncompressedBytes;
	}

	/** @hidden Returns the size of a JPEG image. */
	private static _getSizeJPEG (buffer: ArrayBuffer): vec2 {
		// Skip 4 chars, they are for signature
		let view = new DataView(buffer, 4);

		let i, next;
		while (view.byteLength) {
			// read length of the next block
			i = view.getUint16(0, false);
			// i = buffer.readUInt16BE(0);

			// ensure correct format
			validateJPEGBuffer(view, i);

			// 0xFFC0 is baseline standard(SOF)
			// 0xFFC1 is baseline optimized(SOF)
			// 0xFFC2 is progressive(SOF2)
			next = view.getUint8(i + 1);
			if (next === 0xC0 || next === 0xC1 || next === 0xC2) {
				return [view.getUint16(i + 7, false), view.getUint16(i + 5, false)];
			}

			// move to the next block
			view = new DataView(buffer, view.byteOffset + i + 2);
		}

		throw new TypeError('Invalid JPG, no size found');
	}

	/** @hidden Returns the size of a PNG image. */
	private static _getSizePNG (buffer: ArrayBuffer): vec2 {
		const view = new DataView(buffer);
		const magic = BufferUtils.decodeText(buffer.slice(12, 16));
		if (magic === PNG_FRIED_CHUNK_NAME) {
			return [view.getUint32(32, false), view.getUint32(36, false)];
		}
		return [view.getUint32(16, false), view.getUint32(20, false)];
	}

	/** @hidden Returns the size of a WebP image. */
	private static _getSizeWebP (buffer: ArrayBuffer): vec2 {
		// Reference: http://tools.ietf.org/html/rfc6386
		const RIFF = BufferUtils.decodeText(buffer.slice(0, 4));
		const WEBP = BufferUtils.decodeText(buffer.slice(8, 12));
		if (RIFF !== 'RIFF' || WEBP !== 'WEBP') return null;

		const view = new DataView(buffer);

		// Reference: https://wiki.tcl-lang.org/page/Reading+WEBP+image+dimensions
		let offset = 12;
		while (offset < buffer.byteLength) {
			const chunkId = BufferUtils.decodeText(buffer.slice(offset, offset + 4));
			const chunkByteLength = view.getUint32(offset + 4, true);
			if (chunkId === 'VP8 ') {
				const width = view.getInt16(offset + 14, true) & 0x3fff;
				const height = view.getInt16(offset + 16, true) & 0x3fff;
				return [width, height];
			} else if (chunkId === 'VP8L') {
				const b0 = view.getUint8(offset + 9);
				const b1 = view.getUint8(offset + 10);
				const b2 = view.getUint8(offset + 11);
				const b3 = view.getUint8(offset + 12);
				const width = 1 + (((b1 & 0x3F) << 8) | b0);
				const height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
				return [width, height];
			}
			offset += 8 + chunkByteLength + (chunkByteLength % 2);
		}

		return null;
	}

	/** @hidden */
	private static _getSizeKTX2 (buffer: ArrayBuffer): vec2 {
		validateKTX2Buffer(new DataView(buffer));
		const view = new DataView(buffer);
		return [view.getUint32(20, true), view.getUint32(24, true)];
	}

	/** Returns the preferred file extension for the given MIME type. */
	public static mimeTypeToExtension(mimeType: string): string {
		if (mimeType === 'image/jpeg') return 'jpg';
		return mimeType.split('/').pop();
	}

	/** Returns the MIME type for the given file extension. */
	public static extensionToMimeType(extension: string): string {
		if (extension === 'jpg') return 'image/jpeg';
		return `image/${extension}`;
	}
}

function validateKTX2Buffer (view: DataView): void {
	const magicBuffer = view.buffer.slice(view.byteOffset + 1, view.byteOffset + 7);
	const magic = BufferUtils.decodeText(magicBuffer);
	if (magic !== 'KTX 20') throw new TypeError('Corrupt KTX2.');
}

function validateJPEGBuffer (view: DataView, i: number): void {
    // index should be within buffer limits
    if (i > view.byteLength) {
        throw new TypeError('Corrupt JPG, exceeded buffer limits');
    }
    // Every JPEG block must begin with a 0xFF
    if (view.getUint8(i) !== 0xFF) {
        throw new TypeError('Invalid JPG, marker table corrupted');
    }
}

function getUint64 (view: DataView, byteOffset: number, littleEndian: boolean): number {
	// https://stackoverflow.com/questions/53103695/
	const left = view.getUint32(byteOffset, littleEndian);
	const right = view.getUint32(byteOffset + 4, littleEndian);
	return littleEndian ? left + (2 ** 32 * right) : (2 ** 32 * left) + right;
}

export { ImageUtils };
