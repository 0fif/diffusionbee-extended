module.exports = {
    "appId": "com.0fif.diffusionbee-extended",
    "productName": "DiffusionBee Extended",
    "afterPack": "./scripts/adhoc-sign.cjs",
    "artifactName": "DiffusionBee-Extended-${version}-${arch}.${ext}",
    "extraResources": [
        {
            "from": "../.runtime/release-resources",
            "to": ".",
            "filter": [
                "**/*"
            ]
        },
        {
            "from": "../backends/mflux",
            "to": "mflux",
            "filter": [
                "runner.py",
                "diagnostics.py",
                "models.json",
                "requirements*.txt"
            ]
        },
        {
            "from": "../LICENSE",
            "to": "LICENSE"
        }
    ],
    "mac": {
        "icon": "build/Icon-1024.png",
        "identity": null,
        "hardenedRuntime": false,
        "entitlements": "build/entitlements.mac.plist",
        "entitlementsInherit": "build/entitlements.mac.plist",
        "minimumSystemVersion": "26.0.0",
        "target": [
            {
                "target": "dmg",
                "arch": [
                    "arm64"
                ]
            },
            {
                "target": "zip",
                "arch": [
                    "arm64"
                ]
            }
        ]
    },
    "directories": {
        "app": "dist_electron/bundled",
        "output": "dist_electron",
        "buildResources": "build"
    }
};
