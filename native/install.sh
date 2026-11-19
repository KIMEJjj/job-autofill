#!/bin/zsh
# 키체인 도우미를 크롬에 등록합니다 (이 Mac 사용자 계정에만).
# 도우미는 macOS 보호 폴더(데스크탑·문서)가 아닌 ~/Library/Application Support/pubfill 에 복사해 실행합니다.
# 사용: EXT_ID=<chrome://extensions에 보이는 이 확장의 ID> ./install.sh      지우기: ./install.sh --remove
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="${EXT_ID:-kaocggbljmmjoaffkeoajllpmhfmbfmn}"
APPDIR="$HOME/Library/Application Support/pubfill"
HOSTDIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
if [[ "$1" == "--remove" ]]; then
  rm -f "$HOSTDIR/com.pubfill.keychain.json" "$APPDIR/pubfill-keychain"; echo "제거 완료"; exit 0
fi
# 저장소에서 받은 경우 실행 파일이 없으므로 소스에서 만듦(Xcode 명령줄 도구 필요: xcode-select --install)
if [[ ! -x "$DIR/pubfill-keychain" ]]; then
  swiftc -O "$DIR/pubfill-keychain.swift" -o "$DIR/pubfill-keychain"
fi
mkdir -p "$APPDIR" "$HOSTDIR"
cp "$DIR/pubfill-keychain" "$APPDIR/pubfill-keychain"
chmod +x "$APPDIR/pubfill-keychain"
cat > "$HOSTDIR/com.pubfill.keychain.json" <<JSON
{
  "name": "com.pubfill.keychain",
  "description": "지원서 자동입력 – Mac 키체인 도우미",
  "path": "$APPDIR/pubfill-keychain",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON
echo "등록 완료: $APPDIR/pubfill-keychain"
