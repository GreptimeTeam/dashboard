.PHONY: test-ci-build

test-ci-build:
	# 1. Clean old dependencies and build artifacts
	rm -rf node_modules release dist
	# 2. Install dependencies (strict, same as CI)
	pnpm install --frozen-lockfile
	# 3. Build production assets
	pnpm run build:docker
	# 4. Package the dist folder into a tarball (same as CI)
	mkdir -p release
	tar -czvf release/build.tar.gz ./dist
	cd release && shasum -a 256 build.tar.gz > sha256.txt && cd ..
	@echo "✅ CI build simulation complete: release/build.tar.gz"
	# 5. Serve the dist directory to verify in browser
	pnpm dlx serve ./dist -l 5179 -s --cors