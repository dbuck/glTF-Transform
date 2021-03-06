import { Accessor, Document, ExtensionProperty, GLTF, ImageUtils, Texture } from '@gltf-transform/core';
import { bounds } from './bounds';
import { getGLPrimitiveCount } from './utils';

export function inspect (doc: Document): Report {
	return {
		scenes: listScenes(doc),
		meshes: listMeshes(doc),
		materials: listMaterials(doc),
		textures: listTextures(doc),
		animations: listAnimations(doc),
	};
}

/** List scenes. */
function listScenes (doc): PropertyReport<SceneReport> {
	const scenes = doc.getRoot().listScenes().map((scene) => {
		const root = scene.listChildren()[0];
		const sceneBounds = bounds(scene);
		return {
			name: scene.getName(),
			rootName: root ? root.getName() : '',
			bboxMin: toPrecision(sceneBounds.min),
			bboxMax: toPrecision(sceneBounds.max),
		};
	});
	return {properties: scenes};
}

/** List meshes. */
function listMeshes (doc: Document): PropertyReport<MeshReport> {
	const meshes: MeshReport[] = doc.getRoot().listMeshes().map((mesh) => {
		const instances = mesh.listParents()
			.filter((parent) => parent.propertyType !== 'Root')
			.length;
		let glPrimitives = 0;
		let verts = 0;
		let indexed = 0;
		const componentTypes: Set<string> = new Set();
		const semantics: Set<string> = new Set();
		const meshAccessors: Set<Accessor> = new Set();

		mesh.listPrimitives().forEach((prim) => {
			prim.listSemantics().forEach((s) => semantics.add(s));
			for (const attr of prim.listAttributes()) {
				componentTypes.add(attr.getArray().constructor.name);
				meshAccessors.add(attr);
			}
			for (const targ of prim.listTargets()) {
				for (const attr of targ.listAttributes()) {
					componentTypes.add(attr.getArray().constructor.name);
					meshAccessors.add(attr);
				}
			}
			if (prim.getIndices()) {
				const indices = prim.getIndices();
				componentTypes.add(indices.getArray().constructor.name);
				indexed++;
				meshAccessors.add(indices);
			}
			verts += prim.getAttribute('POSITION').getCount();
			glPrimitives += getGLPrimitiveCount(prim);
		});

		let size = 0;
		Array.from(meshAccessors).forEach((a) => (size += a.getArray().byteLength));

		const modes = mesh.listPrimitives()
			.map((prim) => MeshPrimitiveModeLabels[prim.getMode()]);

		return {
			name: mesh.getName(),
			mode: Array.from(new Set(modes)),
			primitives: mesh.listPrimitives().length,
			glPrimitives: glPrimitives,
			vertices: verts,
			indexed: mesh.listPrimitives().length === indexed,
			components: Array.from(componentTypes).sort().map((s) => s.replace('Array', '')),
			attributes: Array.from(semantics).sort(),
			instances: instances,
			size: size,
		};
	});

	return {properties: meshes};
}

/** List materials. */
function listMaterials (doc: Document): PropertyReport<MaterialReport> {
	const materials: MaterialReport[] = doc.getRoot().listMaterials().map((material) => {
		const instances = material.listParents()
			.filter((parent) => parent.propertyType !== 'Root')
			.length;

		// Find all texture slots attached to this material or its extensions.
		const extensions = new Set<ExtensionProperty>(material.listExtensions());
		const slots = doc.getGraph().getLinks()
			.filter((link) => {
				const child = link.getChild();
				const parent = link.getParent();
				if (child instanceof Texture && parent === material) {
					return true;
				}
				if (child instanceof Texture
						&& parent instanceof ExtensionProperty
						&& extensions.has(parent)) {
					return true;
				}
				return false;
			})
			.map((link) => link.getName());

		return {
			name: material.getName(),
			instances,
			textures: slots,
			alphaMode: material.getAlphaMode(),
			doubleSided: material.getDoubleSided(),
		};
	});

	return {properties: materials};
}

/** List textures. */
function listTextures (doc: Document): PropertyReport<TextureReport> {
	const textures: TextureReport[] = doc.getRoot().listTextures().map((texture) => {
		const instances = texture.listParents()
			.filter((parent) => parent.propertyType !== 'Root')
			.length;

		const slots = doc.getGraph().getLinks()
			.filter((link) => link.getChild() === texture)
			.map((link) => link.getName())
			.filter((name) => name !== 'texture');

		const resolution = ImageUtils.getSize(texture.getImage(), texture.getMimeType());

		return {
			name: texture.getName(),
			uri: texture.getURI(),
			slots: Array.from(new Set(slots)),
			instances,
			mimeType: texture.getMimeType(),
			resolution: resolution ? resolution.join('x') : '',
			size: texture.getImage().byteLength,
			gpuSize: ImageUtils.getMemSize(texture.getImage(), texture.getMimeType()),
		};
	});

	return {properties: textures};
}

/** List animations. */
function listAnimations (doc: Document): PropertyReport<AnimationReport> {
	const animations: AnimationReport[] = doc.getRoot().listAnimations().map((anim) => {
		let minTime = Infinity;
		let maxTime = -Infinity;
		anim.listSamplers().forEach((sampler) => {
			minTime = Math.min(minTime, sampler.getInput().getMin([])[0]);
			maxTime = Math.max(maxTime, sampler.getInput().getMax([])[0]);
		});

		let size = 0;
		let keyframes = 0;
		const accessors: Set<Accessor> = new Set();
		anim.listSamplers().forEach((sampler) => {
			keyframes += sampler.getInput().getCount();
			accessors.add(sampler.getInput());
			accessors.add(sampler.getOutput());
		});
		Array.from(accessors).forEach((accessor) => {
			size += accessor.getArray().byteLength;
		});

		return {
			name: anim.getName(),
			channels: anim.listChannels().length,
			samplers: anim.listSamplers().length,
			duration: Math.round((maxTime - minTime) * 1000) / 1000,
			keyframes: keyframes,
			size: size,
		};
	});

	return {properties: animations};
}

interface Report {
	scenes: PropertyReport<SceneReport>;
	meshes: PropertyReport<MeshReport>;
	materials: PropertyReport<MaterialReport>;
	textures: PropertyReport<TextureReport>;
	animations: PropertyReport<AnimationReport>;
}

interface PropertyReport<T> {
	properties: T[];
	errors?: string[];
	warnings?: string[];
}

interface SceneReport {
	name: string;
	rootName: string;
	bboxMin: number[];
	bboxMax: number[];
}

interface MeshReport {
	name: string;
	primitives: number;
	indexed: boolean;
	mode: string[];
	vertices: number;
	glPrimitives: number;
	components: string[];
	attributes: string[];
	instances: number;
	size: number;
}

interface MaterialReport {
	name: string;
	instances: number;
	textures: string[];
	alphaMode: GLTF.MaterialAlphaMode;
	doubleSided: boolean;
}

interface TextureReport {
	name: string;
	uri: string;
	slots: string[];
	instances: number;
	mimeType: string;
	resolution: string;
	size: number;
	gpuSize: number;
}

interface AnimationReport {
	name: string;
	channels: number;
	samplers: number;
	keyframes: number;
	duration: number;
	size: number;
}

const MeshPrimitiveModeLabels = [
	'POINTS',
	'LINES',
	'LINE_LOOP',
	'LINE_STRIP',
	'TRIANGLES',
	'TRIANGLE_STRIP',
	'TRIANGLE_FAN',
];

/** Maps values in a vector to a finite precision. */
function toPrecision(v: number[]): number[] {
	for (let i = 0; i < v.length; i++) {
		if (v[i].toFixed) v[i] = Number(v[i].toFixed(5));
	}
	return v;
}
