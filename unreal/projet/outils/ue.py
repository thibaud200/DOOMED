"""Petit client MCP pour l'éditeur Unreal (serveur natif 5.8, http://127.0.0.1:8000/mcp).
Usage :  python ue.py tool <toolset> <tool> '<json args>'
         python ue.py py <fichier.py>        (exécute un script via execute_tool_script)
         python ue.py describe <toolset>
"""
import json, sys, urllib.request

URL = "http://127.0.0.1:8000/mcp"
_sid = None

def _post(payload):
    global _sid
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if _sid:
        h["Mcp-Session-Id"] = _sid
    req = urllib.request.Request(URL, json.dumps(payload).encode(), h)
    with urllib.request.urlopen(req, timeout=600) as r:
        _sid = r.headers.get("Mcp-Session-Id") or _sid
        body = r.read().decode("utf-8")
    return json.loads(body) if body.strip() else None

def init():
    _post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
           "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                      "clientInfo": {"name": "ue.py", "version": "1"}}})
    _post({"jsonrpc": "2.0", "method": "notifications/initialized"})

def call(name, args):
    r = _post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
               "params": {"name": name, "arguments": args}})
    if "error" in r:
        return "ERREUR: " + json.dumps(r["error"], ensure_ascii=False)
    res = r["result"]
    txt = "\n".join(c.get("text", "") for c in res.get("content", []))
    return ("ERREUR (isError): " if res.get("isError") else "") + txt

def tool(toolset, name, args=None):
    return call("call_tool", {"toolset_name": toolset, "tool_name": name, "arguments": args or {}})

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    init()
    cmd = sys.argv[1]
    if cmd == "tool":
        print(tool(sys.argv[2], sys.argv[3], json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}))
    elif cmd == "describe":
        print(call("describe_toolset", {"toolset_name": sys.argv[2]}))
    elif cmd == "py":
        code = open(sys.argv[2], encoding="utf-8").read()
        print(tool("editor_toolset.toolsets.programmatic.ProgrammaticToolset", "execute_tool_script", {"script": code}))

def rv(txt):
    """Valeur de retour d'un outil (returnValue) ou lève l'erreur."""
    if txt.startswith("ERREUR"):
        raise RuntimeError(txt[:2000])
    return json.loads(txt).get("returnValue") if txt.strip() else None

def capture(path, xform=None, annotate=False):
    import base64
    if not xform:
        xform = rv(tool("EditorToolset.EditorAppToolset", "GetCameraTransform"))
    args = {"captureTransform": xform, "bShowUI": False,
            "annotations": {"gridSpacing": 0, "gridExtent": 0, "gridHeight": 0, "maxLabelDistance": 0,
                            "maxLabels": 0, "classFilter": {"refPath": "/Script/Engine.Actor"}}}
    if annotate:
        args["annotations"].update({"gridSpacing": 500, "gridExtent": 5000, "maxLabelDistance": 20000, "maxLabels": 15})
    r = rv(tool("EditorToolset.EditorAppToolset", "CaptureViewport", args))
    img = r["image"]
    data = img.get("data") or img.get("base64") or next(v for v in img.values() if isinstance(v, str) and len(v) > 1000)
    open(path, "wb").write(base64.b64decode(data))
    return {k: v for k, v in r.items() if k != "image"}
