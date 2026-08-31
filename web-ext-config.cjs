// web-ext config — keeps the packaged .zip to just what the manifest needs,
// not the TypeScript sources/build tooling that live alongside it.
module.exports = {
    ignoreFiles: [
        "*.ts",
        "*.d.ts",
        "*.d.ts.map",
        "*.js.map",
        "tsconfig.json",
        "package.json",
        "package-lock.json",
        "README.md",
        "LICENSE",
        "scripts/**",
        "web-ext-config.cjs",
        "web-ext-artifacts/**"
    ]
};
