// T009 negative test (003-ci-workflow per quickstart §5.4): gitleaks fixture
// pattern designed to trigger generic-credential rule. NOT a real secret.
// PR will be closed without merge.
//
// Pattern strategy (per user choice B3 "use gitleaks own fixture"):
//   high-entropy 48-char base62 string assigned to credential-named variable;
//   triggers gitleaks's `generic-api-key` rule but NOT GitHub Push Protection
//   (which keys on prefix patterns like AKIA / sk_live_ / ghp_ etc.).

const api_credential = 'H7h6oShChXuTrhKB9z0ZkR3B6xvCqJ5PnK4LcQ8aF7dN1mE9';

export function _t009_dummy(): string {
  return api_credential;
}
