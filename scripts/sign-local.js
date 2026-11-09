const { execFileSync } = require('node:child_process');

// This release uses ad hoc signing for local installation on both Mac architectures.
module.exports = ({ app }) => {
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
