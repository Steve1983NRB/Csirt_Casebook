"""Build the bundled threat-actor reference (MITRE ATT&CK groups + MISP galaxy)."""
import datetime
import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ATTACK = "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json"
MISP = "https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json"
DESCRIPTION_LIMIT = 700


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=180) as response:
            return response.read()
    except urllib.error.URLError:
        if os.name != "nt":
            raise
        return subprocess.run(["curl.exe", "--ssl-no-revoke", "-fsSL", url], check=True, capture_output=True, timeout=300).stdout


def clip(text):
    text = " ".join((text or "").split())
    return text if len(text) <= DESCRIPTION_LIMIT else text[: DESCRIPTION_LIMIT - 1].rstrip() + "…"


def external(obj, source):
    for ref in obj.get("external_references", []):
        if ref.get("source_name") == source and ref.get("external_id"):
            return ref["external_id"], ref.get("url", "")
    return "", ""


def attack_groups():
    bundle = json.loads(fetch(ATTACK))
    objects = bundle["objects"]
    techniques = {}
    for obj in objects:
        if obj.get("type") == "attack-pattern" and not obj.get("revoked") and not obj.get("x_mitre_deprecated"):
            ext, _ = external(obj, "mitre-attack")
            if ext:
                techniques[obj["id"]] = ext
    groups = {o["id"]: o for o in objects if o.get("type") == "intrusion-set" and not o.get("revoked") and not o.get("x_mitre_deprecated")}
    used = {gid: set() for gid in groups}
    for obj in objects:
        if obj.get("type") == "relationship" and obj.get("relationship_type") == "uses" and not obj.get("revoked"):
            if obj.get("source_ref") in groups and obj.get("target_ref") in techniques:
                used[obj["source_ref"]].add(techniques[obj["target_ref"]])
    version = next((o.get("x_mitre_version") for o in objects if o.get("type") == "x-mitre-collection"), "")
    result = []
    for gid, group in groups.items():
        ext, url = external(group, "mitre-attack")
        result.append({
            "id": "attack:" + ext, "name": group["name"], "aliases": sorted(set(group.get("aliases", [])) - {group["name"]}),
            "country": "", "motivation": "", "description": clip(group.get("description", "")),
            "techniques": sorted(used[gid]), "reference": url, "source": "MITRE ATT&CK",
        })
    return result, version


def misp_actors():
    cluster = json.loads(fetch(MISP))
    result = []
    for value in cluster.get("values", []):
        meta = value.get("meta", {})
        country = meta.get("country") or meta.get("cfr-suspected-state-sponsor") or ""
        motive = meta.get("cfr-type-of-incident") or meta.get("motive") or ""
        refs = [r for r in meta.get("refs", []) if isinstance(r, str) and r.startswith("https://")]
        result.append({
            "id": "misp:" + value.get("uuid", value["value"]), "name": value["value"],
            "aliases": sorted(set(meta.get("synonyms", [])) - {value["value"]}), "country": country if isinstance(country, str) else "",
            "motivation": motive if isinstance(motive, str) else "", "description": clip(value.get("description", "")),
            "techniques": [], "reference": refs[0] if refs else "", "source": "MISP Galaxy",
        })
    return result


def main():
    groups, version = attack_groups()
    names = {}
    for g in groups:
        for n in [g["name"], *g["aliases"]]:
            names[n.lower()] = g
    actors = list(groups)
    for item in misp_actors():
        known = next((names[n.lower()] for n in [item["name"], *item["aliases"]] if n.lower() in names), None)
        if known:
            known["country"] = known["country"] or item["country"]
            known["motivation"] = known["motivation"] or item["motivation"]
            known["aliases"] = sorted(set(known["aliases"]) | ({item["name"]} - {known["name"]}) | (set(item["aliases"]) - {known["name"]}))
            known["description"] = known["description"] or item["description"]
        else:
            actors.append(item)
    actors.sort(key=lambda a: a["name"].lower())
    out = ROOT / "public" / "intel"
    out.mkdir(parents=True, exist_ok=True)
    (out / "actors.json").write_text(json.dumps({
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "attackVersion": version,
        "sources": ["MITRE ATT&CK (groups and technique usage)", "MISP Galaxy threat-actor cluster"], "actors": actors,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(actors)} actors ({sum(1 for a in actors if a['techniques'])} with ATT&CK techniques)")


if __name__ == "__main__":
    main()
