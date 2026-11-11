# Rebuild a mobile-ready model from a dense Meshy GLB: simplify geometry (ignoring UV seams), unwrap, and
# re-bake colour + object-space normals from the dense mesh so the low-poly keeps the original look.
import sys, io, numpy as np, trimesh, pyfqmr, xatlas
from PIL import Image
from scipy.spatial import cKDTree
from scipy import ndimage
src, out, target, size = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
hi = trimesh.load(src, force='mesh', process=False)
V, F, UV, Nh = np.asarray(hi.vertices), np.asarray(hi.faces), np.asarray(hi.visual.uv), np.asarray(hi.vertex_normals)
mat = hi.visual.material; tex = np.asarray(mat.baseColorTexture.convert('RGB')).astype(np.float32)
H, W = tex.shape[:2]
def sample(uv): 
    x = np.clip((uv[:, 0] % 1.0) * (W - 1), 0, W - 1).astype(int); y = np.clip((1 - (uv[:, 1] % 1.0)) * (H - 1), 0, H - 1).astype(int); return tex[y, x]
# dense colour samples: vertices + face centroids
Pc = np.vstack([V, V[F].mean(1)]); Cc = np.vstack([sample(UV), sample(UV[F].mean(1))]); Nc = np.vstack([Nh, hi.face_normals])
print('dense samples', len(Pc))
# geometry-only simplification
geo = trimesh.Trimesh(V, F, process=True); print('welded', len(geo.vertices), len(geo.faces))
s = pyfqmr.Simplify(); s.setMesh(geo.vertices, geo.faces); s.simplify_mesh(target_count=target, aggressiveness=5, preserve_border=False, verbose=False)
v, f, _ = s.getMesh(); lo = trimesh.Trimesh(v, f, process=True); lo.remove_unreferenced_vertices(); print('low', len(lo.vertices), len(lo.faces))
vm, idx, uv = xatlas.parametrize(lo.vertices, lo.faces)
P = lo.vertices[vm]; Nl = lo.vertex_normals[vm]; print('unwrapped verts', len(P))
# rasterise atlas
pos = np.zeros((size, size, 3), np.float32); nrm = np.zeros((size, size, 3), np.float32); mask = np.zeros((size, size), bool)
px = uv * (size - 1)
for t in idx:
    a, b, c = px[t]; mn = np.floor(np.minimum(np.minimum(a, b), c)).astype(int) - 1; mx = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int) + 1
    mn = np.clip(mn, 0, size - 1); mx = np.clip(mx, 0, size - 1)
    xs, ys = np.meshgrid(np.arange(mn[0], mx[0] + 1), np.arange(mn[1], mx[1] + 1)); q = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float32)
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-9: continue
    w0 = ((b[1] - c[1]) * (q[:, 0] - c[0]) + (c[0] - b[0]) * (q[:, 1] - c[1])) / d; w1 = ((c[1] - a[1]) * (q[:, 0] - c[0]) + (a[0] - c[0]) * (q[:, 1] - c[1])) / d; w2 = 1 - w0 - w1
    ok = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
    if not ok.any(): continue
    w = np.clip(np.stack([w0[ok], w1[ok], w2[ok]], 1), 0, 1); w /= w.sum(1, keepdims=True)
    yy, xx = q[ok, 1].astype(int), q[ok, 0].astype(int)
    pos[yy, xx] = w @ P[t]; nrm[yy, xx] = w @ Nl[t]; mask[yy, xx] = True
print('texels', mask.sum())
tree = cKDTree(Pc); tp = pos[mask]; tn = nrm[mask]; tn /= np.linalg.norm(tn, axis=1, keepdims=True) + 1e-9
# push the query slightly outward so we pick the outer skin, then choose the neighbour whose normal agrees best
d, nn = tree.query(tp + tn * 0.002, k=6, workers=-1)
score = (Nc[nn] * tn[:, None, :]).sum(2) - d * 40; best = nn[np.arange(len(nn)), score.argmax(1)]
col = np.zeros((size, size, 3), np.float32); col[mask] = Cc[best]
nm = np.zeros((size, size, 3), np.float32); hn = Nc[best]; flip = (hn * tn).sum(1) < 0; hn[flip] *= -1; nm[mask] = hn
# dilate into gutters
for img in (col, nm):
    m = mask.copy()
    for _ in range(6):
        g = ndimage.binary_dilation(m); ring = g & ~m
        acc = np.zeros_like(img); cnt = np.zeros((size, size), np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(img, (dy, dx), (0, 1)); sm = np.roll(m, (dy, dx), (0, 1)); acc += sh * sm[..., None]; cnt += sm
        img[ring] = acc[ring] / np.maximum(cnt[ring], 1)[:, None]; m = g
nm /= np.linalg.norm(nm, axis=2, keepdims=True) + 1e-9
# game orientation: forward +z, feet on y=0 (geometry, vertex normals and the object-space normal map together)
R = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], np.float32); ymin = P[:, 1].min(); P = (P - [0, ymin, 0]) @ R.T; Nl = Nl @ R.T; nm = nm @ R.T; print('ymin', ymin)
cimg = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)[::-1]); nimg = Image.fromarray(((nm * 0.5 + 0.5) * 255).astype(np.uint8)[::-1])
cimg.save(out + '_color.png'); nimg.save(out + '_normal.png')
m = trimesh.Trimesh(P, idx, vertex_normals=Nl, process=False)
m.visual = trimesh.visual.TextureVisuals(uv=uv, material=trimesh.visual.material.PBRMaterial(baseColorTexture=cimg, normalTexture=nimg, metallicFactor=0.0, roughnessFactor=0.9))
m.export(out + '.glb'); print('wrote', out + '.glb', len(P), len(idx))
