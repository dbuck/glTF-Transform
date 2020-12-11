import * as getPixelsNamespace from 'get-pixels';
import * as ndarray from 'ndarray';
import * as savePixelsNamespace from 'save-pixels';
import { BufferUtils, Document, Transform, vec2 } from '@gltf-transform/core';
import initResizeWasm, { resize as _resize, resizeWasm } from '../vendor/resize';

const getPixels = getPixelsNamespace['default'] as Function;
const savePixels = savePixelsNamespace['default'] as Function;

const NAME = 'resize';

export interface ResizeOptions {
	size: vec2;
	filter?: ResizeFilter;
	pattern?: RegExp;
}

export enum ResizeFilter {
	TRIANGLE = 0,
	CATROM = 1,
	MITCHELL = 2,
	LANCZOS3 = 3,
}

const DEFAULT_OPTIONS = {filter: ResizeFilter.LANCZOS3};

let resizeWasmReady: Promise<unknown>;

/**
 * Options:
 * - **size**: Target dimensions for resized textures.
 * - **filter**: Resampling filter.
 * - **pattern**: Pattern (regex) used to match textures, by name or URI.
 */
export function resize (options: ResizeOptions): Transform {
	options = {...DEFAULT_OPTIONS, ...options};

	return async (doc: Document): Promise<void> => {

		const logger = doc.getLogger();

		if (!resizeWasmReady) {
			resizeWasmReady = initResizeWasm(await decodeWASM(resizeWasm));
		}
		await resizeWasmReady;

		for (const texture of doc.getRoot().listTextures()) {
			const match = !options.pattern
				|| options.pattern.test(texture.getName())
				|| options.pattern.test(texture.getURI());
			if (!match) continue;

			logger.info(`inputs: ${texture.getSize()} → ${options.size}`);

			const [inputWidth, inputHeight] = texture.getSize();
			const [outputWidth, outputHeight] = options.size;

			logger.info('decoding...');

			const pixels: ndarray = await new Promise((resolve, reject) => {
				getPixels(
					Buffer.from(texture.getImage()),
					texture.getMimeType(),
					(err, pixels) => err ? reject(err) : resolve(pixels)
				);
			});

			logger.info(`resizing from ${texture.getSize()} to ${options.size}...`);

			const data = _resize(
				new Uint8Array(pixels.data),
				inputWidth,
				inputHeight,
				outputWidth,
				outputHeight,
				3, // TODO(bug): filter
				true, // TODO(bug): ???
				true, // TODO(bug): ???
			);

			const image: ArrayBuffer = await new Promise((resolve, reject) => {
				const chunks: Buffer[] = [];
				// TODO(bug): Need to detect # channels correctly.
				savePixels((ndarray['default'])(data, [outputWidth, outputHeight, 4]), 'png')
					.on('data', (d) => chunks.push(d))
					.on('end', () => resolve(BufferUtils.trim(Buffer.concat(chunks))))
					.on('error', (e) => reject(e));
			});

			texture.setImage(image).setMimeType('image/png');
		}

		logger.debug(`${NAME}: Complete.`);

	};

}

function decodeWASM (dataURI: string): Promise<ArrayBuffer> {
	if ( typeof fetch !== 'undefined' ) {
		// Web.
		return fetch('data:application/octet-stream;base64,' + dataURI)
			.then((response) => response.arrayBuffer())
	}
	// Node.js.
	return Promise.resolve(BufferUtils.trim(Buffer.from(dataURI, 'base64')));
}
