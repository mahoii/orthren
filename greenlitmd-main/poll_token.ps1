$clientId = "d883cbf7-2a1a-4d89-952b-977d2d072f5f"
$deviceCode = "JvqESRKr4MbiZKaA6Wrm9Q7VlI5IQzdCH6QCEbegr1M"
$tokenEndpoint = "https://mcp.motion.so/oauth/token"
$body = @{
    client_id = $clientId
    device_code = $deviceCode
    grant_type = "urn:ietf:params:oauth:grant-type:device_code"
}

while ($true) {
    try {
        $response = Invoke-RestMethod -Uri $tokenEndpoint -Method Post -Body $body
        Write-Output "Successfully authorized!"
        $response | ConvertTo-Json -Depth 5
        break
    } catch {
        # Check if it's authorization_pending
        Start-Sleep -Seconds 5
    }
}
