#!/bin/zsh
# 지인 배포용 묶음 만들기: 키체인 도우미·시험 파일을 빼고 dist/ 에 확장 폴더를 만듭니다.
set -e
cd "$(dirname "$0")"
VER=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/지원서자동입력_v$VER"
PKG="dist/지원서자동입력_배포_v$VER"
mkdir -p dist
# 새 버전 묶음을 다시 만들 때만 그 버전의 기존 산출물을 지우고, 다른 버전은 보존합니다.
rm -rf "$OUT" "$PKG" "$PKG.zip"
mkdir -p "$OUT"
rsync -a --exclude 'test/' --exclude 'native/' --exclude 'dist/' --exclude 'guide/' --exclude 'touchid-test.*' --exclude 'build-dist.sh' --exclude '.DS_Store' --exclude '.gitignore' --exclude '.github/' --exclude 'MAINTAINING.md' --exclude 'README.md' --exclude '인수인계.md' --exclude '작업기록.md' --exclude 'AGENTS.md' --exclude 'AGENTS.local.md' --exclude 'CLAUDE.md' --exclude '발표자료/' --exclude 'demo/' ./ "$OUT/"
python3 - "$OUT/manifest.json" <<'PY'
import json,sys
p=sys.argv[1]; m=json.load(open(p))
m['permissions']=[x for x in m['permissions'] if x!='nativeMessaging']
json.dump(m,open(p,'w'),ensure_ascii=False,indent=2)
PY
# 안내서(md·pdf·그림) 함께 묶기
mkdir -p "$PKG"
mv "$OUT" "$PKG/"
cp guide/안내서.md guide/안내서.pdf "$PKG/"
cp -R guide/images "$PKG/images"
python3 - "dist" "지원서자동입력_배포_v$VER" <<'PY'
# 맥 전용 숨김 파일(__MACOSX, .DS_Store) 없이, 한글 이름은 UTF-8 표시로 묶음 (윈도우에서도 이름 유지)
import os,sys,zipfile
root,name=sys.argv[1],sys.argv[2]
with zipfile.ZipFile(os.path.join(root,name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
    for d,_,fs in os.walk(os.path.join(root,name)):
        for f in fs:
            if f=='.DS_Store' or f.startswith('._'): continue
            full=os.path.join(d,f); z.write(full,os.path.relpath(full,root))
PY
echo "dist/지원서자동입력_배포_v$VER.zip"
