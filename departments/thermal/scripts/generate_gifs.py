from PIL import Image
import os

def create_gif(image_files, output_path, fps=30, loop=0):
    """
    从序列图片创建GIF
    image_files: 图片路径列表
    output_path: 输出GIF路径
    fps: 帧率
    loop: 0表示无限循环
    """
    images = []
    for file in image_files:
        if os.path.exists(file):
            img = Image.open(file)
            # 确保转换为RGBA以支持透明通道（如果是PNG的话）
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            images.append(img)
        else:
            print(f"Warning: File not found {file}")
    
    if images:
        duration = int(1000 / fps)
        # 将RGBA图像转换为P模式(调色板模式)，以便保存为GIF并保持透明度
        # Pillow的save对于GIF有一些特殊处理，通常建议直接保存RGBA，它会自动处理透明
        images[0].save(
            output_path,
            save_all=True,
            append_images=images[1:],
            duration=duration,
            loop=loop,
            disposal=2,  # disposal=2 表示恢复到背景色，对于透明GIF通常更好
            transparency=0 # 如果有问题可以调整这个参数
        )
        print(f"Created GIF: {output_path}")

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    images_dir = os.path.join(base_dir, 'static', 'images')
    gifs_dir = os.path.join(images_dir, 'gifs')
    
    # 创建gifs目录
    os.makedirs(gifs_dir, exist_ok=True)
    
    # 1. 滚筒GIF
    # 静止状态 - 只取第一帧
    roller_static = [os.path.join(images_dir, 'output_drum', 'RT300B.ZT_01.png')]
    create_gif(roller_static, os.path.join(gifs_dir, 'roller-static.gif'), fps=30)
    
    # 运动状态 - 完整序列
    roller_frames = []
    for i in range(13):
        frame_png = os.path.join(images_dir, 'output_drum', f'RT300B.ZT_0{i}.png')
        frame_PNG = os.path.join(images_dir, 'output_drum', f'RT300B.ZT_0{i}.PNG')
        if os.path.exists(frame_png):
            roller_frames.append(frame_png)
        elif os.path.exists(frame_PNG):
            roller_frames.append(frame_PNG)
        else:
            print(f"Missing roller frame: {i}")
            
    create_gif(roller_frames, os.path.join(gifs_dir, 'roller-animated.gif'), fps=30)
    
    # 2. 限位轮GIF
    # 静止状态
    wheel_static = [os.path.join(images_dir, '0.png')]
    create_gif(wheel_static, os.path.join(gifs_dir, 'wheel-static.gif'), fps=30)
    
    # 运动状态
    wheel_frames = [os.path.join(images_dir, f'{i}.png') for i in range(12)]
    create_gif(wheel_frames, os.path.join(gifs_dir, 'wheel-animated.gif'), fps=30)
    
    # 3. 滚圈GIF
    # 静止状态
    ring_static = [os.path.join(images_dir, 'gq-11.png')]
    create_gif(ring_static, os.path.join(gifs_dir, 'ring-static.gif'), fps=30)
    
    # 运动状态
    ring_frames = [os.path.join(images_dir, f'gq-{i}.png') for i in range(11, 22)]
    create_gif(ring_frames, os.path.join(gifs_dir, 'ring-animated.gif'), fps=30)
    
    print("所有GIF生成完成！")

if __name__ == '__main__':
    main()
