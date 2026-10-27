"""Build the complete MITRE ATLAS matrix, mitigations and case studies."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.request

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/"


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=90) as response:
            return response.read()
    except urllib.error.URLError:
        if os.name != "nt":
            raise
        result = subprocess.run(
            ["curl.exe", "--ssl-no-revoke", "-fsSL", url],
            check=True,
            capture_output=True,
            timeout=120,
        )
        return result.stdout


def latest_release():
    path = fetch(BASE + "dist/ATLAS-latest.yaml").decode().strip()
    path = fetch(BASE + "dist/" + path).decode().strip()
    if not path.endswith(".yaml") or "/" in path:
        raise ValueError("MITRE ATLAS latest-release pointer is invalid.")
    return "dist/v6/" + path


def first_https_reference(item):
    for reference in item.get("references", []):
        url = reference.get("url", "")
        if isinstance(url, str) and url.startswith("https://"):
            return url
    return ""


def build(raw, source):
    data = yaml.safe_load(raw)
    version = data["collection"]["version"]
    if data.get("format-version") != "6.0.0" or not version:
        raise ValueError("Unsupported MITRE ATLAS data format.")

    relationships = data.get("relationships", {})
    matrix_order = relationships.get("ATLAS-matrix", {}).get("sequences", [])
    tactics = []
    for relation in sorted(matrix_order, key=lambda item: item.get("position", 0)):
        tactic_id = relation["target"]
        tactic = data["tactics"][tactic_id]
        tactics.append({"id": tactic_id, "slug": tactic_id, "name": tactic["name"]})
    if len(tactics) != len(data.get("tactics", {})):
        raise ValueError("ATLAS tactic ordering is incomplete.")

    mitigation_links = {}
    for mitigation_id, item in data.get("mitigations", {}).items():
        for relation in relationships.get(mitigation_id, {}).get("mitigates", []):
            mitigation_links.setdefault(relation["target"], []).append(mitigation_id)
    case_study_links = {}
    case_studies = []
    for case_id, item in data.get("case-studies", {}).items():
        steps = relationships.get(case_id, {}).get("employs", [])
        normalized_steps = []
        for relation in steps:
            technique_id = relation["target"]
            case_study_links.setdefault(technique_id, []).append(case_id)
            normalized_steps.append({
                "techniqueId": technique_id,
                "description": relation.get("description", ""),
                "tacticId": relation.get("tactic", ""),
                "stepId": relation.get("step-id", ""),
                "leadsTo": relation.get("leads-to", []),
            })
        case_studies.append({
            "id": case_id,
            "name": item["name"],
            "description": item.get("description", ""),
            "url": first_https_reference(item) or f"https://atlas.mitre.org/case-studies/{case_id}",
            "type": item.get("type", ""),
            "actor": item.get("actor", ""),
            "target": item.get("target", ""),
            "date": item.get("date", ""),
            "dateGranularity": item.get("date-granularity", ""),
            "steps": normalized_steps,
        })

    mitigations = []
    for mitigation_id, item in data.get("mitigations", {}).items():
        mitigations.append({
            "id": mitigation_id,
            "name": item["name"],
            "description": item.get("description", ""),
            "url": first_https_reference(item) or f"https://atlas.mitre.org/mitigations/{mitigation_id}",
            "categories": item.get("categories", []),
            "lifecyclePhases": item.get("lifecycle-phases", []),
            "techniqueIds": sorted(
                relation["target"]
                for relation in relationships.get(mitigation_id, {}).get("mitigates", [])
            ),
        })

    techniques = []
    index = {}
    tactic_ids = {tactic["id"] for tactic in tactics}
    for technique_id, item in data.get("techniques", {}).items():
        links = relationships.get(technique_id, {})
        technique_tactics = [
            relation["target"]
            for relation in links.get("achieves", [])
            if relation.get("target") in tactic_ids
        ]
        parent = next(iter(links.get("specializes", [])), {}).get("target")
        if not technique_tactics:
            raise ValueError(f"ATLAS technique {technique_id} has no matrix tactic.")
        technique = {
            "id": technique_id,
            "stixId": "",
            "name": item["name"],
            "description": item.get("description", ""),
            "url": f"https://atlas.mitre.org/techniques/{technique_id}",
            "tactics": technique_tactics,
            "platforms": item.get("platforms", []),
            "parentId": parent,
            "revoked": False,
            "deprecated": False,
            "modified": item.get("modified-date", ""),
            "objectVersion": version,
            "maturity": item.get("maturity", ""),
            "mitigationIds": sorted(mitigation_links.get(technique_id, [])),
            "caseStudyIds": sorted(case_study_links.get(technique_id, [])),
        }
        techniques.append(technique)
        index["atlas:" + technique_id] = {
            "id": technique_id,
            "name": technique["name"],
            "stixId": "",
            "tactics": technique_tactics,
            "tacticNames": [t["name"] for t in tactics if t["id"] in technique_tactics],
            "domain": "atlas",
            "version": version,
            "revoked": False,
            "deprecated": False,
        }

    atlas = {
        "domain": "atlas",
        "name": "MITRE ATLAS",
        "description": data["collection"]["description"],
        "version": version,
        "source": "https://github.com/mitre-atlas/atlas-data/blob/main/" + source,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "tactics": tactics,
        "techniques": sorted(techniques, key=lambda item: item["id"]),
        "mitigations": mitigations,
        "caseStudies": case_studies,
    }
    if len(atlas["techniques"]) != len(data["techniques"]):
        raise ValueError("ATLAS technique normalization lost source records.")
    return atlas, index


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=pathlib.Path, help="Use a previously downloaded ATLAS YAML file.")
    args = parser.parse_args()
    source = latest_release() if not args.input else "dist/v6/ATLAS-" + yaml.safe_load(args.input.read_bytes())["collection"]["version"] + ".yaml"
    raw = fetch(BASE + source) if not args.input else args.input.read_bytes()
    atlas, atlas_index = build(raw, source)
    output = ROOT / "public" / "attack"
    output.mkdir(parents=True, exist_ok=True)
    (output / "atlas.json").write_text(json.dumps(atlas, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

    index_path = ROOT / "lib" / "attack-index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index = {key: value for key, value in index.items() if not key.startswith("atlas:")}
    index.update(atlas_index)
    index_path.write_text(json.dumps(index, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

    current_year = datetime.datetime.now(datetime.timezone.utc).year
    copyright_years = "2021" if current_year == 2021 else f"2021-{current_year}"
    attribution = (
        f"MITRE ATLAS data is ©{copyright_years} The MITRE Corporation.\n"
        "Approved for Public Release; Distribution Unlimited. Public Release Case Numbers 21-2363, 26-1162.\n"
        "Source: https://github.com/mitre-atlas/atlas-data\n"
        f"Data version: {atlas['version']}\n"
        f"Source SHA-256: {atlas['sourceSha256']}\n"
    )
    (output / "ATLAS-ATTRIBUTION.txt").write_text(attribution, encoding="utf-8")
    print(
        f"ATLAS {atlas['version']}: {len(atlas['tactics'])} tactics, "
        f"{len(atlas['techniques'])} techniques, {len(atlas['mitigations'])} mitigations, "
        f"{len(atlas['caseStudies'])} case studies"
    )


if __name__ == "__main__":
    main()
