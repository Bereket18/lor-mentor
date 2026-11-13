#!/usr/bin/env node
/**
 * Startup self-check for the image pipeline.
 *
 * Support-ticket attachments are re-encoded through sharp before they are
 * stored, so a container whose native binary did not install (wrong libc,
 * `--omit=optional`, a lockfile copied from another platform) would start
 * "fine" and then fail every upload with an opaque error. This check runs
 * before migrations and refuses to start instead.
 *
 * Run manually: `node scripts/check-sharp.js`
 * Bypass: never. If this fails, the image is wrong; rebuild it.
 */
'use strict';

function fail(message, error) {
  console.error('');
  console.error('FATAL: sharp could not load a working native binary.');
  console.error(message);
  if (error) {
    console.error(error.stack || String(error));
  }
  console.error('');
  console.error('The API will not start because support attachments could not be');
  console.error('processed. Rebuild the image on this platform:');
  console.error('  docker compose -f docker-compose.prod.yml build --no-cache api');
  console.error('The image base must match the sharp binary: glibc (node:*-slim,');
  console.error('Debian/Ubuntu) uses @img/sharp-linux-x64; Alpine/musl needs');
  console.error('@img/sharp-linuxmusl-x64 and libc6-compat. See apps/api/Dockerfile.');
  console.error('');
  process.exit(1);
}

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (error) {
    fail('`require("sharp")` threw. The package or its platform binary is missing.', error);
    return;
  }

  try {
    const { data, info } = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 16, g: 120, b: 120 },
      },
    })
      .png()
      .toBuffer({ resolveWithObject: true });

    if (!data || data.length === 0 || info.width !== 2 || info.height !== 2) {
      fail('sharp loaded but produced no usable PNG output.');
      return;
    }

    console.log(
      `sharp ${sharp.versions.sharp} ready (libvips ${sharp.versions.vips}, ${process.arch})`,
    );
  } catch (error) {
    fail('sharp loaded but failed to encode an image.', error);
  }
}

void main();
