import os
import urllib.request
import ssl

def download_file(url, filepath):
    print(f"Downloading {url} ...")
    try:
        # Ignore SSL errors if any
        context = ssl._create_unverified_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=context, timeout=30) as response, open(filepath, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Success: Saved to {filepath}")
        return True
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return False

def main():
    draco_dir = os.path.join("static", "js", "draco")
    os.makedirs(draco_dir, exist_ok=True)
    
    # Try different CDNs in order of reliability in China
    cdns = [
        "https://unpkg.com/three@0.158.0/examples/jsm/libs/draco/gltf/",
        "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/gltf/",
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/gltf/"
    ]
    
    files = [
        "draco_decoder.js",
        "draco_decoder.wasm",
        "draco_wasm_wrapper.js"
    ]
    
    for filename in files:
        filepath = os.path.join(draco_dir, filename)
        if os.path.exists(filepath):
            print(f"{filename} already exists, skipping.")
            continue
            
        success = False
        for cdn in cdns:
            url = cdn + filename
            if download_file(url, filepath):
                success = True
                break
                
        if not success:
            print(f"\nERROR: Could not download {filename} from any CDN.")
            print("Please manually download the files and place them in static/js/draco/")
            return

    print("\nAll Draco decoder files have been successfully downloaded locally!")

if __name__ == "__main__":
    main()
