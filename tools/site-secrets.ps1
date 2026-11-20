# Asks for the 3 pasted secrets of each subject site, one after another (Turso token, Razorpay secret, admin key).
$root = 'C:\Users\Siddharth D\Projects'
foreach ($s in 'baeee101', 'baeng101', 'baphy105') {
  Set-Location "$root\$s-notes"
  foreach ($k in 'TURSO_AUTH_TOKEN', 'RAZORPAY_KEY_SECRET', 'ADMIN_KEY') {
    Write-Host ''
    Write-Host "===== $s : paste $k =====" -ForegroundColor Yellow
    npx.cmd wrangler secret put $k
  }
}
Write-Host ''
Write-Host 'ALL 9 DONE' -ForegroundColor Green
