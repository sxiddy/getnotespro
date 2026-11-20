# Asks for the 3 pasted secrets of the EVS site on Cloudflare (Turso token, Razorpay secret, admin key).
Set-Location 'C:\Users\Siddharth D\Projects\evs-notes'
foreach ($k in 'TURSO_AUTH_TOKEN', 'RAZORPAY_KEY_SECRET', 'ADMIN_KEY') {
  Write-Host ''
  Write-Host "===== EVS : paste $k =====" -ForegroundColor Yellow
  npx.cmd wrangler secret put $k
}
Write-Host ''
Write-Host 'ALL 3 DONE' -ForegroundColor Green
