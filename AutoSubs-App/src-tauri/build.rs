fn main() {
    tauri_build::build();

    // Ensure the final link step has correct macOS SDK and platform version flags.
    // This addresses undefined symbol errors like ___isPlatformVersionAtLeast on newer SDKs
    // when rustc invokes clang without passing -platform_version/-syslibroot consistently.
    #[cfg(target_os = "macos")]
    {
        // Determine minimum deployment target. Prefer env; default to 13.3.0.
        let min_ver = std::env::var("MACOSX_DEPLOYMENT_TARGET")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "13.3.0".to_string());

        // Query the active macOS SDK path and version via xcrun.
        let sdk_path = std::process::Command::new("xcrun")
            .args(["--sdk", "macosx", "--show-sdk-path"]).output()
            .ok()
            .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None });
        let sdk_ver = std::process::Command::new("xcrun")
            .args(["--sdk", "macosx", "--show-sdk-version"]).output()
            .ok()
            .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None })
            .unwrap_or_else(|| "15.5".to_string());

        if let Some(sdk) = sdk_path {
            println!("cargo:warning=Using macOS SDK at: {}", sdk);
            println!("cargo:warning=Using macOS SDK version: {}", sdk_ver);
            // Ensure clang knows the SDK and the linker uses it for syslibroot.
            println!("cargo:rustc-link-arg=-isysroot");
            println!("cargo:rustc-link-arg={}", sdk);
            println!("cargo:rustc-link-arg=-Wl,-syslibroot,{}", sdk);
        }

        // Pass platform version info to the linker explicitly.
        println!(
            "cargo:rustc-link-arg=-Wl,-platform_version,macos,{},{}",
            min_ver, sdk_ver
        );

        // Also be explicit about the minimum macOS version for the driver.
        // Trim a trailing .0 to accommodate values like 13.3.0 vs 13.3.
        let min_ver_driver = min_ver.trim_end_matches('.').trim_end_matches('0');
        if !min_ver_driver.is_empty() {
            println!("cargo:rustc-link-arg=-mmacosx-version-min={}", min_ver_driver);
        }

        // Ensure compiler-rt builtins are available at link time. Newer SDKs expect
        // ___isPlatformVersionAtLeast from libclang_rt.osx.a; in some Rust link invocations
        // the driver may not add it automatically. We add it explicitly if found.
        let clang_res_dir = std::process::Command::new("clang")
            .arg("-print-resource-dir")
            .output()
            .ok()
            .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None });
        if let Some(res) = clang_res_dir {
            println!("cargo:warning=Clang resource dir: {}", res);
            let darwin_lib = format!("{}/lib/darwin", res);
            let crt = format!("{}/libclang_rt.osx.a", darwin_lib);
            if std::path::Path::new(&crt).exists() {
                println!("cargo:rustc-link-search=native={}", darwin_lib);
                println!("cargo:rustc-link-lib=static=clang_rt.osx");
                // Also pass the absolute archive path to ensure ld picks it up
                println!("cargo:rustc-link-arg={}", crt);
                // And force-load the archive so the symbol is not skipped due to
                // archive resolution order or dead_strip behavior.
                println!("cargo:rustc-link-arg=-Wl,-force_load,{}", crt);
                println!("cargo:warning=Linking compiler-rt archive: {}", crt);
            }
        }

        // Safe duplicates: ensure required frameworks and C++ are linked at the final step.
        // The whisper-rs-sys build script also links these; duplications are harmless.
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=framework=MetalKit");
        println!("cargo:rustc-link-lib=framework=CoreML");
        println!("cargo:rustc-link-lib=framework=Accelerate");
        println!("cargo:rustc-link-lib=c++");
    }
}
