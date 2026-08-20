import trimesh
import sys

def convert_stl_to_glb(stl_path, glb_path):
    print(f"Loading {stl_path}...")
    try:
        mesh = trimesh.load_mesh(stl_path)
        print(f"Exporting to {glb_path}...")
        mesh.export(glb_path)
        print("Done!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert.py <input.stl> <output.glb>")
    else:
        convert_stl_to_glb(sys.argv[1], sys.argv[2])
