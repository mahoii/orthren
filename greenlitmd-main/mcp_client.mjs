import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function run() {
  const token = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjZxLTFNOHBsMDNJbUppejk3NXdWVDNBQ1AxMVV4YWtuelEzRFo5Ty1INkEiLCJ0eXAiOiJhdCtqd3QifQ.eyJjbGllbnRfaWQiOiJkODgzY2JmNy0yYTFhLTRkODktOTUyYi05NzdkMmQwNzJmNWYiLCJzY29wZSI6Im1jcCIsImlzcyI6Imh0dHBzOi8vbWNwLm1vdGlvbi5zbyIsInN1YiI6IjRlNjA4MDkxLTlhZDAtNDQ2NS1iNWQ1LTk1N2Q5ZjQzNjI2ZiIsImF1ZCI6Imh0dHBzOi8vbWNwLm1vdGlvbi5zby9tY3AiLCJpYXQiOjE3ODA3NjcxMjYsImV4cCI6MTc4MDc2NzcyNiwianRpIjoiMTc1MzkzNDktZmQwNS00YTA4LWIzNDQtNGJhYTdjMDAzNDZlIn0.kgxYus16KgfK3N9fUqi5uZLbbQVrKsR1Vle0pvPTdkSPwi6oyeeGIEYzLeIGcxriNcGy8edm4G_5444uqaSk5huPfv5JRezKzbaHcgMCsKtPR3NNH8G_Rm4w96mRu6dW02x4YG-FhM182o7M-Q1nSiG6w_AVmy3qZLqQzZmQ3kcVbsQyn83b6Hf4oY5j1alcgU242Toj6ijCUDdC3l64GcWMbGDE1uFaRE37Pe5027Cc_yjl9Qdyu2hM-E3k3MwlyBlEqeVCcTSyMnJQ-LPyIoIkE9J_w1bXb1wOCd5gPPe12hEq9-Cb2egBMosU-SOZRl4I3ES2ET-IEY6DVAYahA";
  const transport = new SSEClientTransport(
    new URL("https://mcp.motion.so/mcp"),
    { eventSourceInit: { headers: { Authorization: `Bearer ${token}` } }, requestInit: { headers: { Authorization: `Bearer ${token}` } } }
  );
  
  const client = new Client({ name: "Antigravity", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  
  const resources = await client.listResources();
  console.log("Resources:", JSON.stringify(resources, null, 2));

  for (const r of resources.resources) {
     if (r.uri.includes('history') || r.uri.includes('sessions') || r.uri.includes('video')) {
         const data = await client.readResource({ uri: r.uri });
         console.log("Resource data for", r.uri, ":", JSON.stringify(data, null, 2));
     }
  }
  process.exit(0);
}
run().catch(console.error);
