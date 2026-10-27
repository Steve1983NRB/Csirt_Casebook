export type DFIRResource={
 id:string;
 name:string;
kind:string;
description:string;
repository:string;
license:string;
handling:string;
relatedUrl?:string;
relatedLabel?:string;
};

export const dfirResources:DFIRResource[]=[
 {id:'indicators',name:'DFIR Report Indicators',kind:'Indicators',description:'Indicators published alongside The DFIR Report investigations. Domains, URLs, IPs and hashes are synchronized into the Threat intel library with report references.',repository:'https://github.com/The-DFIR-Report/DFIR-Report-Indicators',license:'Repository terms not specified',handling:'Synced server-side as historical leads; items are retained between syncs and must be validated before treating as active.'},
 {id:'artifacts',name:'DFIR Artifacts',kind:'Forensic artifacts',description:'Repository of sample artifacts and recruitment examples.',repository:'https://github.com/The-DFIR-Report/DFIR-Artifacts',license:'All rights reserved; written permission required',handling:'No artifact content is fetched, copied or displayed here. The repository license prohibits use, redistribution and incorporation into other products or services; obtain written permission before using its materials.'},
 {id:'sigma',name:'Sigma Rules',kind:'Detection rules',description:'The repository states that public-report Sigma rules are now contributed directly to SigmaHQ.',repository:'https://github.com/The-DFIR-Report/Sigma-Rules',license:'GPL-3.0 for the repository',handling:'No rule content is imported. Browse the original repository or find TheDFIRReport-tagged rules in SigmaHQ.',relatedUrl:'https://github.com/search?q=repo%3ASigmaHQ%2Fsigma+%22TheDFIRReport%22+path%3Arules&type=code',relatedLabel:'Search SigmaHQ'},
 {id:'yara',name:'YARA Rules',kind:'Detection rules',description:'YARA rules generated from The DFIR Report investigations.',repository:'https://github.com/The-DFIR-Report/Yara-Rules',license:'GPL-3.0; repository requests contact for commercial or closed-source use',handling:'Rules are not imported or executed by the platform. Review the license and obtain any needed permission before use.'},
 {id:'suricata',name:'Suricata Rules',kind:'Detection rules',description:'Network detection rules published by The DFIR Report.',repository:'https://github.com/The-DFIR-Report/Suricata-Rules',license:'GPL-3.0',handling:'Rules are not imported or executed by the platform. Review and test them in an isolated detection environment before use.'},
 {id:'cyberchef',name:'CyberChef Recipes',kind:'Analyst tools',description:'Recipes the publisher says were used during investigations.',repository:'https://github.com/The-DFIR-Report/cyberchef-recipes',license:'No license identified in the repository metadata',handling:'Recipes are not copied or run by the platform. Open the source and check its current terms before reuse.'},
 {id:'scripts',name:'Analysis Scripts',kind:'Analyst tools',description:'PowerShell and Python analysis scripts published by The DFIR Report.',repository:'https://github.com/The-DFIR-Report/scripts',license:'No license identified in the repository metadata',handling:'Scripts are not copied or executed by the platform. Review source and current terms before running any downloaded code.'}
];
