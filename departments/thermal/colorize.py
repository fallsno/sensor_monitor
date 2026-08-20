import trimesh
import numpy as np

def colorize_glb(input_path, output_path):
    print(f"Loading {input_path}...")
    scene = trimesh.load(input_path)
    
    # Scale down the model to meters (assuming it was in mm or smaller)
    # The bounds are huge: ~6.8e6, so we scale by 0.001 to bring it to ~6800
    # and then maybe another 0.001 to bring it to ~6.8 meters
    scale_matrix = trimesh.transformations.scale_matrix(0.000001)
    scene.apply_transform(scale_matrix)
    
    # Define colors (RGBA)
    colors = {
        'main': [180, 180, 190, 255],        # Light gray/silver
        'motor': [50, 80, 120, 255],         # Dark blue
        'Thrust': [150, 150, 150, 255],      # Metallic gray
        'Tire': [40, 40, 40, 255],           # Dark rubber
        'UP_Press': [220, 80, 80, 255],      # Red
        'UP_rpm': [220, 180, 50, 255],       # Yellow
        'Drive_Assembly': [80, 80, 80, 255], # Dark gray
        'Displacement': [50, 180, 220, 255], # Cyan
        'default': [200, 200, 200, 255]      # Default gray
    }
    
    for node_name, geom_names in scene.graph.geometry_nodes.items():
        for geom_name in geom_names:
            geom = scene.geometry[geom_name]
            
            # Determine color based on node name
            assigned_color = colors['default']
            for key, color in colors.items():
                if key in node_name:
                    assigned_color = color
                    break
            
            # Create a new material if it doesn't exist or modify existing
            if hasattr(geom.visual, 'material'):
                geom.visual.material.baseColorFactor = assigned_color
                geom.visual.material.metallicFactor = 0.5
                geom.visual.material.roughnessFactor = 0.5
            else:
                # If it's a Trimesh, we can set visual.face_colors
                geom.visual.face_colors = assigned_color
                
    print(f"Exporting to {output_path}...")
    scene.export(output_path)
    print("Done!")

if __name__ == "__main__":
    colorize_glb('G:\\系统搭建\\sensor_monitor\\static\\models\\roller_split.glb', 'G:\\系统搭建\\sensor_monitor\\static\\models\\roller_colored.glb')
