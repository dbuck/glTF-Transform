import { GLTFContainer, IBufferMap } from './container';
import { Logger, LoggerVerbosity } from './logger';
interface IGLTFAnalysis {
    meshes: number;
    textures: number;
    materials: number;
    animations: number;
    primitives: number;
    dataUsage: {
        geometry: number;
        targets: number;
        animation: number;
        textures: number;
        json: number;
    };
}
/**
 * Utility class for glTF transforms.
 */
declare class GLTFUtil {
    /**
     * Creates a GLTFContainer from the given JSON and files.
     * @param json
     * @param files
     */
    static wrapGLTF(json: GLTF.IGLTF, resources: IBufferMap): GLTFContainer;
    /**
     * Creates a GLTFContainer from the given GLB binary.
     * @param glb
     */
    static wrapGLB(glb: ArrayBuffer): GLTFContainer;
    /**
     * Serializes a GLTFContainer to GLTF JSON and external files.
     * @param container
     */
    static bundleGLTF(container: GLTFContainer): {
        json: Object;
        resources: IBufferMap;
    };
    /**
     * Serializes a GLTFContainer to a GLB binary.
     * @param container
     */
    static bundleGLB(container: GLTFContainer): ArrayBuffer;
    /**
     * Creates an empty buffer.
     */
    static createBuffer(): ArrayBuffer;
    /**
     * Creates a buffer from a Data URI.
     * @param dataURI
     */
    static createBufferFromDataURI(dataURI: string): ArrayBuffer;
    static createLogger(name: string, verbosity: LoggerVerbosity): Logger;
    static encodeText(text: string): ArrayBuffer;
    static decodeText(buffer: ArrayBuffer): string;
    static analyze(container: GLTFContainer): IGLTFAnalysis;
    static getAccessorByteLength(accessor: GLTF.IAccessor): number;
}
export { GLTFUtil };