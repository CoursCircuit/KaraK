#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

version=1.9.5
model=ggml-large-v3-turbo-q5_0.bin
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
out="$PWD/assets/alignment"
mkdir -p "$out"
curl -fLsS --retry 3 "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v$version" |
  tar -xz -C "$work"
source="$work/whisper.cpp-$version"
for arch in arm64 x86_64; do
  cmake -S "$source" -B "$work/$arch" -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_OSX_ARCHITECTURES="$arch" -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 \
    -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_METAL=OFF \
    -DGGML_OPENMP=OFF -DGGML_LLAMAFILE=OFF -DGGML_AVX512=OFF \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
  cmake --build "$work/$arch" --target whisper-cli --parallel 6
done
lipo -create "$work/arm64/bin/whisper-cli" "$work/x86_64/bin/whisper-cli" -output "$out/whisper-cli"
chmod 755 "$out/whisper-cli"
cp "$source/LICENSE" "$out/LICENSE-whisper.cpp.txt"
curl -fLsS --retry 3 "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$model" -o "$work/$model"
(
  cd "$work"
  printf '%s  %s\n' 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2 "$model" | shasum -a 256 -c
)
mv "$work/$model" "$out/$model"
curl -fLsS --retry 3 https://raw.githubusercontent.com/openai/whisper/main/LICENSE -o "$out/LICENSE-Whisper-model.txt"
