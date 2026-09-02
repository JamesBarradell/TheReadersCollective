Set-Location "c:\Temp\The Readers Corner"

function Read-SecretValue {
	param([string]$Prompt)
	$secureValue = Read-Host -Prompt $Prompt -AsSecureString
	$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
	try {
		return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
	} finally {
		[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
	}
}

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
	Stop-Process -Id $listener.OwningProcess -Force
}

$env:GOOGLE_CLIENT_ID = "904207302199-et5do98bebik7atmjbftmi728l1m1o68.apps.googleusercontent.com"
$env:APP_BASE_URL = "http://localhost:3000"
$env:RESEND_FROM_EMAIL = Read-Host -Prompt "Resend verified sender (for example, Readers Collective <noreply@yourdomain.com>)"
$env:RESEND_API_KEY = Read-SecretValue "Resend API key"
$env:JWT_SECRET = Read-SecretValue "JWT secret"

npm start