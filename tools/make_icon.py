# Рисует значок приложения: полумесяц из кружева на чёрном фоне.
# Запуск из папки проекта: python tools/make_icon.py
import math
from PIL import Image, ImageDraw

S = 2048
C = S / 2
R = 690                      # внешняя окружность луны
IN_R = 590                   # окружность, которая вырезает полумесяц
IN_C = (C + 300, C - 170)    # центр вырезающей окружности
CX = C - 40                  # луна чуть левее центра: справа остаётся место для искры


def dot(d, x, y, r, fill):
    d.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def inner_dist(x, y):
    return math.hypot(x - IN_C[0], y - IN_C[1])


mask = Image.new('L', (S, S), 0)
d = ImageDraw.Draw(mask)

# полумесяц
dot(d, CX, C, R, 255)
dot(d, IN_C[0], IN_C[1], IN_R, 0)

# фестоны по внешнему краю: только там, где есть сама луна
step = math.radians(8.2)
a = 0.0
while a < math.tau:
    x = CX + math.cos(a) * R
    y = C + math.sin(a) * R
    if inner_dist(x, y) > IN_R + 95:
        dot(d, x, y, 62, 255)
    a += step

# узор: цветы по середине серпа, дырочки вдоль края
def thickness(a):
    """Толщина серпа вдоль радиуса под углом a."""
    r = R
    while r > 0 and inner_dist(CX + math.cos(a) * r, C + math.sin(a) * r) > IN_R:
        r -= 4
    return R - r


a = 0.0
while a < math.tau:
    x = CX + math.cos(a) * (R - 58)
    y = C + math.sin(a) * (R - 58)
    if inner_dist(x, y) > IN_R + 60:
        dot(d, x, y, 19, 0)
    a += step / 1.0

a = math.radians(40)
placed = []
while a < math.radians(330):
    t = thickness(a)
    if t > 210:
        r = R - 58 - (t - 58) / 2
        x = CX + math.cos(a) * r
        y = C + math.sin(a) * r
        size = min(92, t * 0.24)
        if all(math.hypot(x - p, y - q) > (size + s) * 1.42 for p, q, s in placed):
            placed.append((x, y, size))
            dot(d, x, y, size * 0.3, 0)
            for k in range(6):
                b = k * math.tau / 6 + a
                dot(d, x + math.cos(b) * size * 0.78, y + math.sin(b) * size * 0.78, size * 0.3, 0)
    a += math.radians(2)

# цвет: перелив от кости к голубому и сиреневому
stops = [(0.0, (240, 237, 229)), (0.5, (108, 159, 224)), (1.0, (167, 139, 250))]


def colour(t):
    for (p, a0), (q, b0) in zip(stops, stops[1:]):
        if t <= q:
            k = (t - p) / (q - p)
            return tuple(int(a0[i] + (b0[i] - a0[i]) * k) for i in range(3))
    return stops[-1][1]


small = 256
grad = Image.new('RGB', (small, small))
px = grad.load()
for y in range(small):
    for x in range(small):
        px[x, y] = colour(min(1, max(0, (x * 0.55 + y * 0.45) / small * 1.15 - 0.07)))
grad = grad.resize((S, S), Image.BICUBIC)

# искра у рогов луны
spark = Image.new('L', (S, S), 0)
sd = ImageDraw.Draw(spark)
sx, sy, sr = C + 395, C - 95, 190


def curve(p0, p1, p2, p3):
    for i in range(40):
        t = i / 40
        u = 1 - t
        yield tuple(u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k] for k in (0, 1))


# та же искра, что в символах приложения: контур в сетке 24 × 24
pts = []
for seg in (((12, 0), (12.8, 7.6), (16.4, 11.2), (24, 12)), ((24, 12), (16.4, 12.8), (12.8, 16.4), (12, 24)),
            ((12, 24), (11.2, 16.4), (7.6, 12.8), (0, 12)), ((0, 12), (7.6, 11.2), (11.2, 7.6), (12, 0))):
    pts += [(sx + (x - 12) / 12 * sr, sy + (y - 12) / 12 * sr) for x, y in curve(*seg)]
sd.polygon(pts, fill=255)

icon = Image.new('RGB', (S, S), (10, 10, 10))
icon.paste(grad, (0, 0), mask)
icon.paste(Image.new('RGB', (S, S), (240, 237, 229)), (0, 0), spark)

for size in (180, 192, 512):
    icon.resize((size, size), Image.LANCZOS).save(f'icons/icon-{size}.png', optimize=True)
print('ok', len(placed))
