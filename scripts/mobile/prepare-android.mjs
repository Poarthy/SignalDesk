import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const mainSourceSet = path.join(projectRoot, "android", "app", "src", "main");
const overlayResources = path.join(projectRoot, "mobile", "android-overlay", "res");
const versionName = process.env.APP_VERSION_NAME;
const versionCode = process.env.APP_VERSION_CODE;
const allowCleartext = process.env.ALLOW_CLEARTEXT === "1";

function fail(message) {
  throw new Error(`prepare-android: ${message}`);
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) fail(`resource overlay is missing: ${source}`);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function updateAndroidAttribute(attributes, name, value) {
  const pattern = new RegExp(`\\s+android:${name}=(["'])[^"']*\\1`);
  if (pattern.test(attributes)) return attributes.replace(pattern, ` android:${name}="${value}"`);
  return `${attributes} android:${name}="${value}"`;
}

function removeAndroidAttribute(attributes, name) {
  const pattern = new RegExp(`\\s+android:${name}=(["'])[^"']*\\1`);
  return attributes.replace(pattern, "");
}

function patchManifest(manifestPath) {
  let manifest = fs.readFileSync(manifestPath, "utf8");
  const applicationPattern = /<application\b([^>]*)>/;
  if (!applicationPattern.test(manifest)) fail(`could not find <application> in ${manifestPath}`);

  manifest = manifest.replace(applicationPattern, (_match, attributes) => {
    let updated = updateAndroidAttribute(attributes, "allowBackup", "false");
    updated = updateAndroidAttribute(updated, "supportsRtl", "true");
    updated = allowCleartext
      ? updateAndroidAttribute(updated, "usesCleartextTraffic", "true")
      : removeAndroidAttribute(updated, "usesCleartextTraffic");
    return `<application${updated}>`;
  });

  manifest = manifest.replace(/\s*<uses-permission(?:-[^\s/>]+)?\b[^>]*\/>\s*/g, "\n");
  const manifestTag = /<manifest\b[^>]*>/;
  if (!manifestTag.test(manifest)) fail(`could not find <manifest> in ${manifestPath}`);
  manifest = manifest.replace(manifestTag, (tag) => `${tag}\n    <uses-permission android:name="android.permission.INTERNET" />`);
  fs.writeFileSync(manifestPath, manifest);
}

function patchGradle(gradlePath) {
  let gradle = fs.readFileSync(gradlePath, "utf8");
  const versionNamePattern = /^([ \t]*versionName[ \t]*(?:=[ \t]*)?)(["'])[^"']*\2.*$/m;
  const versionCodePattern = /^([ \t]*versionCode[ \t]*(?:=[ \t]*)?)\d+\b.*$/m;
  if (!versionNamePattern.test(gradle)) fail(`could not find versionName in ${gradlePath}`);
  if (!versionCodePattern.test(gradle)) fail(`could not find versionCode in ${gradlePath}`);
  gradle = gradle.replace(versionNamePattern, `$1"${versionName}"`);
  gradle = gradle.replace(versionCodePattern, `$1${versionCode}`);
  fs.writeFileSync(gradlePath, gradle);
}

function main() {
  if (!fs.existsSync(mainSourceSet)) fail(`generated Android source set is missing: ${mainSourceSet}`);
  if (!versionName || !/^[0-9A-Za-z.+_-]+$/.test(versionName)) fail("APP_VERSION_NAME must contain only letters, numbers, dots, pluses, underscores, or hyphens");
  if (!versionCode || !/^\d+$/.test(versionCode) || Number(versionCode) < 1) fail("APP_VERSION_CODE must be a positive integer");

  const resourcesTarget = path.join(mainSourceSet, "res");
  copyDirectory(overlayResources, resourcesTarget);

  const groovyGradle = path.join(projectRoot, "android", "app", "build.gradle");
  const kotlinGradle = path.join(projectRoot, "android", "app", "build.gradle.kts");
  const gradlePath = fs.existsSync(groovyGradle) ? groovyGradle : fs.existsSync(kotlinGradle) ? kotlinGradle : null;
  if (!gradlePath) fail("could not find android/app/build.gradle or android/app/build.gradle.kts");
  patchGradle(gradlePath);

  const manifestPath = path.join(mainSourceSet, "AndroidManifest.xml");
  if (!fs.existsSync(manifestPath)) fail(`AndroidManifest.xml is missing: ${manifestPath}`);
  patchManifest(manifestPath);

  console.log(`prepare-android: copied overlay, set version ${versionName} (${versionCode}), INTERNET only, cleartext=${allowCleartext}`);
}

main();
