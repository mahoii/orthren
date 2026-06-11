$clientId = "d883cbf7-2a1a-4d89-952b-977d2d072f5f"
$deviceCode = "UJM2B3nw6qdQeUsZ2OsVjLpaPW3sAcFevfTsye-2GUE"
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
        Start-Sleep -Seconds 5
    }
}
