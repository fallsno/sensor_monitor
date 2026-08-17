import json
import struct
import sys
from pathlib import Path


GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A


def read_glb(path: Path):
    with path.open("rb") as fh:
        magic, version, length = struct.unpack("<III", fh.read(12))
        if magic != GLB_MAGIC:
            raise ValueError(f"{path} is not a GLB file")
        if version != 2:
            raise ValueError(f"{path} is GLB {version}, expected 2")

        chunks = []
        json_obj = None
        while fh.tell() < length:
            chunk_length, chunk_type = struct.unpack("<II", fh.read(8))
            chunk_data = fh.read(chunk_length)
            chunks.append((chunk_type, chunk_data))
            if chunk_type == JSON_CHUNK:
                json_obj = json.loads(chunk_data.decode("utf-8").rstrip(" \t\r\n\0"))

        if json_obj is None:
            raise ValueError(f"{path} does not contain a JSON chunk")

        return json_obj, chunks


def write_glb(path: Path, json_obj, chunks):
    encoded_json = json.dumps(json_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    padded_json = encoded_json + b" " * ((4 - len(encoded_json) % 4) % 4)

    out_chunks = []
    json_written = False
    for chunk_type, chunk_data in chunks:
        if chunk_type == JSON_CHUNK and not json_written:
            out_chunks.append((chunk_type, padded_json))
            json_written = True
        else:
            out_chunks.append((chunk_type, chunk_data))

    if not json_written:
        out_chunks.insert(0, (JSON_CHUNK, padded_json))

    total_length = 12 + sum(8 + len(data) for _, data in out_chunks)
    with path.open("wb") as fh:
        fh.write(struct.pack("<III", GLB_MAGIC, 2, total_length))
        for chunk_type, chunk_data in out_chunks:
            fh.write(struct.pack("<II", len(chunk_data), chunk_type))
            fh.write(chunk_data)


def transplant_materials(reference_json, target_json):
    ref_meshes = reference_json.get("meshes", [])
    target_meshes = target_json.get("meshes", [])

    if len(ref_meshes) != len(target_meshes):
        raise ValueError("Mesh count mismatch between reference and target GLB")

    for index, (ref_mesh, target_mesh) in enumerate(zip(ref_meshes, target_meshes)):
        if ref_mesh.get("name") != target_mesh.get("name"):
            raise ValueError(
                f"Mesh order mismatch at index {index}: "
                f"{ref_mesh.get('name')} != {target_mesh.get('name')}"
            )

        ref_primitives = ref_mesh.get("primitives", [])
        target_primitives = target_mesh.get("primitives", [])
        if len(ref_primitives) != len(target_primitives):
            raise ValueError(f"Primitive count mismatch for mesh {ref_mesh.get('name')}")

        for ref_primitive, target_primitive in zip(ref_primitives, target_primitives):
            if "material" in ref_primitive:
                target_primitive["material"] = ref_primitive["material"]
            else:
                target_primitive.pop("material", None)

    target_json["materials"] = reference_json.get("materials", [])
    return target_json


def main():
    if len(sys.argv) != 4:
        print(
            "Usage: python scripts/retarget_glb_materials.py "
            "<reference.glb> <target.glb> <output.glb>"
        )
        raise SystemExit(1)

    reference_path = Path(sys.argv[1])
    target_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    reference_json, _ = read_glb(reference_path)
    target_json, target_chunks = read_glb(target_path)
    patched_json = transplant_materials(reference_json, target_json)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_glb(output_path, patched_json, target_chunks)

    print(f"Reference: {reference_path}")
    print(f"Target:    {target_path}")
    print(f"Output:    {output_path}")
    print(f"Materials: {len(patched_json.get('materials', []))}")
    print(f"Meshes:    {len(patched_json.get('meshes', []))}")


if __name__ == "__main__":
    main()
