# 사용: <pillow 있는 python> gif.py <프레임폴더> <출력.gif> [가로픽셀] [색수]
# rec.mjs가 남긴 f-####-시각.jpg 프레임을 시각 간격대로 이어 붙여 GIF로 만듭니다.
import glob
import os
import re
import sys

from PIL import Image, ImageChops

src, dest = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1120
colors = int(sys.argv[4]) if len(sys.argv) > 4 else 96
max_fps = 15

files = sorted(glob.glob(os.path.join(src, 'f-*.jpg')),
               key=lambda p: int(re.search(r'-(\d+)\.jpg$', p).group(1)))
if not files:
    sys.exit('프레임이 없습니다: ' + src)
stamps = [int(re.search(r'-(\d+)\.jpg$', p).group(1)) for p in files]

picked = []
for path, stamp in zip(files, stamps):
    if not picked or stamp - picked[-1][1] >= 1000 / max_fps - 1:
        picked.append((path, stamp))

frames = []
for i, (path, stamp) in enumerate(picked):
    image = Image.open(path).convert('RGB')
    height = round(image.height * width / image.width)
    image = image.resize((width, height), Image.LANCZOS)
    if i + 1 < len(picked):
        duration = picked[i + 1][1] - stamp
    else:
        duration = 900
    frames.append([image, max(40, min(duration, 900))])

merged = []
for image, duration in frames:
    if merged and ImageChops.difference(merged[-1][0], image).getbbox() is None:
        merged[-1][1] += duration
    else:
        merged.append([image, duration])

paletted = [image.convert('P', palette=Image.ADAPTIVE, colors=colors) for image, _ in merged]
paletted[0].save(dest, save_all=True, append_images=paletted[1:],
                 duration=[d for _, d in merged], loop=0, optimize=True, disposal=2)
print('frames', len(merged), 'size', os.path.getsize(dest))
