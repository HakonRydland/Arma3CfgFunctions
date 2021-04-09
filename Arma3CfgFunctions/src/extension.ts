import * as vscode from 'vscode';
import * as fs from 'fs';
import {parse} from './class-parser';
import axios from "axios";
import { load } from "cheerio";
import commandsJson from "./Data/commands.json";
import functionsJson from "./Data/functions.json";

//base defines
let functionsLib = {}
let config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
let completionItems: vscode.Disposable[] = [];

//functions
function disposCompletionItems() {
    completionItems.forEach(element => {
        element.dispose();
    });
    completionItems = [];
};

let missionRoot = '';
let descriptionPath = '';
let workingFolderPath = '';
function updateFolderPaths() {
    let workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined) { return };
    missionRoot = workspaceFolders[0].uri.fsPath;
    if (config.has("MissionRoot")) {
        missionRoot = (missionRoot + "/" + config.get("MissionRoot")).split('\\').join('/');
    };
    console.debug("Mission root path: ", missionRoot);


    if (config.has('DescriptionPath')) {
        let path = <string>config.get('DescriptionPath');
        if (path != "") {
            descriptionPath = path.split('\\').join('/');
        } else {
            descriptionPath = '**/*description.ext';
        };
    };
    console.debug("Description path: ", descriptionPath);

    workingFolderPath = workspaceFolders[0].uri.fsPath.split('\\').join('/') + '/.vscode';
    if (!fs.existsSync(workingFolderPath)) {
        fs.mkdirSync(workingFolderPath);
    };
    console.debug("Working folder path: ", workingFolderPath);
};
if (vscode.workspace.workspaceFolders !== undefined) { updateFolderPaths() };


async function parseDescription(context: vscode.ExtensionContext) {

    let description = await vscode.workspace.findFiles(descriptionPath, "", 1);
    if (description.length == 0) { vscode.window.showWarningMessage("Arma3 CfgFunctions | Can't find description.ext, aborting!"); return };
    console.info(`Description.ext path: ${description[0].fsPath}`);

    vscode.workspace.openTextDocument(description[0]).then(async (document) => {
        if (document.isDirty) { vscode.window.showInformationMessage(`Arma3 CfgFunctions | File unsaved, aborting. | Path: ${descriptionPath}`);};
        //flag declaration
        let cfgFunctionsFound = false;
        let inCfgFunctions = false;
        let brackets = 0;
        console.debug("Parsing flags declaired");

        //create temp file
        fs.writeFileSync(workingFolderPath + "/cfgfunctions.txt", "");
        let fd = fs.openSync(workingFolderPath + "/cfgfunctions.txt", "a+");

        //write to temp file
        for (let index = 0; index < document.lineCount; index++) {
            const element = document.lineAt(index);
            if (inCfgFunctions && brackets == 0) {continue};
            if (!cfgFunctionsFound) { cfgFunctionsFound = (element.text.toLowerCase().search("class cfgfunctions") > -1)} else {

                brackets -= element.text.search('}') + 1;
                if (cfgFunctionsFound && brackets > 0) {
                    inCfgFunctions = true;
                    if (element.text.startsWith('//')) {continue};
                    console.debug(`Line: ${element.lineNumber} | Bracket level: ${brackets} | element text: ${element.text}`);
                    if (element.text.search("#include") > -1) {
                        let path = parsePath(missionRoot, element.text);
                        await parseFile(fd, path);
                    } else {
                        fs.writeFileSync(fd, ('\n' + element.text));
                    };
                };
                brackets += element.text.search('{') + 1;
            };
        };
        fs.closeSync(fd);

        //parse to JSON with external lib and deleteTmpFile
        let parsedjson = parse(fs.readFileSync(workingFolderPath + "/cfgfunctions.txt").toString());
        fs.unlinkSync(workingFolderPath + "/cfgfunctions.txt");

        functionsLib = await generateLibrary(parsedjson);
        console.log(functionsLib);

        //reload language additions (auto completion and header hovers)
        reloadLanguageAdditions(context);

    });
};

function parsePath(currentPath: string, include: string) {
    let path = currentPath.split('/');
    include = include.split('"')[1];
    let includePath = include.split('\\').join('/').split('/'); // windowns and linux pathing
    for (const step of includePath) {
        if (step == '..') {
            path.pop();
        } else {
            path.push(step);
        };
    };
    let ret = path.join('/');

    if (!fs.existsSync(ret)) {
        vscode.window.showErrorMessage(`Arma3 CfgFunctions | Invalid include filepath: ${include}`);
        console.error(`invalid include: ${ret}`);
    };

    return ret;
};

async function parseFile(fd:number, filePath:string) {
    let dirPathArray = filePath.split('/');
    dirPathArray.pop();
    let dirPath = dirPathArray.join('/');
    if (!fs.existsSync(filePath)) {
        return 1;
    };
    console.debug(`parsing file at --> ${filePath}`);
    await vscode.workspace.openTextDocument(filePath).then(async (document) => {
        for (let index = 0; index < document.lineCount; index++) {
            const element = document.lineAt(index);
            if (element.text.startsWith('//')) {continue};

            if (element.text.search("#include") > -1) {
                let path = parsePath(dirPath , element.text);
                await parseFile(fd, path);
            } else {
                fs.writeFileSync(fd, ('\n' + element.text));
            };
        }
    });
};

async function generateLibrary(cfgFunctionsJSON:JSON) {

    function setPropertyIfExists (object: Object, key: string, Atributes: Object ) {
        if (Object.getOwnPropertyDescriptor(object, key)) {
            Atributes[key] = object[key];
        };
    };

    console.log("Generating function lib");
    let functionLib = {};

    //Default attributes
    let MasterAtributes = {
        'Name': ""
        , 'Tag': ""
        , 'file': "functions"
        , 'ext': ".sqf"
        , 'Uri': vscode.Uri.prototype
        , 'Header': ""
    };

    let atributeKeys = ['Tag','file','ext']

    for (const Tag in cfgFunctionsJSON) {
        let NamespaceAtributes = Object.assign({}, MasterAtributes);
        const Namespace = cfgFunctionsJSON[Tag];

        //Namespace traits
        NamespaceAtributes.Tag = Tag;
        setPropertyIfExists(Namespace, 'file', NamespaceAtributes);

        for (const FolderName in Namespace) {
            const Folder = Namespace[FolderName];
            let FolderAtributes = Object.assign({}, NamespaceAtributes);
            FolderAtributes.file = `${NamespaceAtributes.file}\\${FolderName}`;

            //Folder traits
            setPropertyIfExists(Folder,'file',FolderAtributes);
            setPropertyIfExists(Folder, 'Tag', FolderAtributes);

            //Functions
            for (const functionName in Folder) {
                if (atributeKeys.includes(functionName)) {continue};
                const func = Folder[functionName];
                let functionAtributes = Object.assign( {}, FolderAtributes);

                //Function traits
                setPropertyIfExists(func, 'ext', functionAtributes);
                setPropertyIfExists(func, 'Tag', functionAtributes);
                    //Assign default call name and file path
                Object.assign(functionAtributes, { Name: functionAtributes.Tag + "_fnc_" + functionName})
                Object.assign(functionAtributes, { file: functionAtributes.file + "\\fn_" + functionName + functionAtributes.ext });
                setPropertyIfExists(func, 'file', functionAtributes);

                Object.assign(functionAtributes, { Uri: vscode.Uri.file(missionRoot + '/' + functionAtributes.file)});
                let Header = await getHeader(functionAtributes.Uri);
                Object.assign(functionAtributes, { Header: Header})

                //Registre function in library
                let entrySring = '{"'+functionAtributes.Name+'":'+JSON.stringify(functionAtributes)+'}';
                let entry = JSON.parse(entrySring);
                Object.assign(functionLib, entry);
            }
        }
    };
    return functionLib;
};

async function getHeader(uri: vscode.Uri) {
    //get text from file
    let text = fs.readFileSync(uri.fsPath).toString();
    if (text === undefined) { return "" };

    //find header and extract it
    if (!text.includes('/*')) { return "" };
    let header = text.split('/*')[1];
    if (header === undefined) { return "" }
    header = header.split('*/')[0];

    //trim new line
    if (header == text || header === undefined) {return ""};
    if (header.startsWith('\r\n')) {header = header.substr(2, header.length)}
    if (header.endsWith('\r\n')) { header = header.substr(0, header.length - 2) }

    //verify we actually have a header
    if (header == text || header === undefined) {return ""};
    return header
};

function reloadLanguageAdditions(context: vscode.ExtensionContext) {
    disposCompletionItems();
    if (!config.get('DisableAutoComplete')) {
        for (const key in functionsLib) {
            const element = functionsLib[key];
            let disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document: vscode.TextDocument, Position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
                    return [
                        new vscode.CompletionItem(element.Name)
                    ]
                }
            })
            context.subscriptions.push(disposable);
            completionItems.push(disposable);
        };
    };

    if (!config.get('DisableHeaderHover')) {
        for (const key in functionsLib) {
            const element = functionsLib[key];
            if (!(element.Header == '')) {
                let disposable = vscode.languages.registerHoverProvider('sqf', {
                    provideHover(document, position, token) {

                        const range = document.getWordRangeAtPosition(position);
                        const word = document.getText(range);
                        if (word.toLowerCase() == element.Name.toLowerCase()) {

                            return new vscode.Hover({
                                language: "plaintext",
                                value: element.Header
                            });
                        }
                    }
                });
                context.subscriptions.push(disposable);
                completionItems.push(disposable);
            };
        };
    }
};

function onSave(Document: vscode.TextDocument) {
    //for Arma header files recompile to catch new or removed functions
    if (Document.languageId == "ext") {
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
        return
    };

    //for sqf files only update header of changed file
    if (Document.languageId == "sqf") {
        let nameArray = Document.fileName.split('\\');
        let name = nameArray[nameArray.length - 1];
        name = name.substr(3, name.length - 7); //remove fn_ prefix and .sqf file extension
        (Object.keys(functionsLib)).forEach(async Key => {
            if (Key.endsWith(name)) {
                let element = functionsLib[Key];
                let header = await getHeader(element.Uri);
                element.Header = header;
                return
            };
        });
    };
};

function parseResponce(responce, classID) {
    let $ = load(responce.data);

    //icon class
    let icons = $('div.locality-icons');
    let locIcons: any;
    if (icons.length > 0) { locIcons = icons[0]['children'] };

    //header contents
    let elements = $(classID)[0]['children'].filter(element => { return element.type == 'tag' && element.name == 'dl' });

    //parse text
    let commandText = '';
    function addToCommandText(text: string) { commandText += text };

    function parseTypeDT(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) { addToCommandText(element.data) };
            });
        }
    };

    function extractDataFromTag(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) { addToCommandText(element.data) } else {
                    extractDataFromTag(element);
                };
            });
        };
    };

    function parseTypeDD(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) { addToCommandText(element.data) } else {
                    switch (element.name) {
                        case 'code': { addToCommandText('\n```sqf\n'); extractDataFromTag(element); addToCommandText('\n```\n'); break };
                        case 'a': { parseTypeA(element); break };
                        case 'b': { parseTypeB(element); break };
                        case 'tt': { parseTypeTT(element); break };
                    };
                };
                if (element.children) {
                    element.children.forEach(element => {
                        extractDataFromTag(element);
                    });
                };
            });
        };
    };

    function parseTypeTT(element) {
        if (element.data) { addToCommandText(element.data); } else {
            if (element.children) { element.children.forEach(element => { parseTypeTT(element) }) };
        };
    };

    function parseTypeB(element) {
        element.children.forEach(element => {
            if (element.data) {
                addToCommandText(element.data);
            } else {
                switch (element.type) {
                    case 'tag': {
                        extractDataFromTag(element);
                        break
                    };
                    default: {
                        console.warn(`Unknown behaviour parseTypeB() -->`);
                        console.warn(element);
                        break
                    };
                };
            };
        });
    };

    function parseTypeA(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) { addToCommandText(element.data) } else {
                    parseTypeA(element);
                };
            });
        };
    };

    function parseTypeDL(element) {
        element.children.forEach(element => {
            if (element.type == 'tag') {
                switch (element.name) {
                    case 'dt': { addToCommandText('\n\n### '); parseTypeDT(element); break };
                    case 'dd': { addToCommandText('\n'); parseTypeDD(element); break };
                }
            }
        });
    };

    if (locIcons) {
        locIcons.forEach(icon => {
            let title = icon['children'][0]['attribs']['title'];
            if (title) {
                addToCommandText(`[${title}]`);
            };
        });
    };

    elements.forEach(element => {
        if (element.name == 'dl') { parseTypeDL(element); addToCommandText('\n') } else {
            console.warn(`unknown tag name: ${element.name}`);
        };
    });

    commandText = commandText.substr(0, commandText.search('See also:')).trim();
    return commandText;
};

async function generateCommands() {
    const AxiosInstance = axios.create();
    let output = {};

    //get array of commands from input file
    let fd = fs.openSync(`${workingFolderPath}/cfgFunctions/commands.txt`, "a+");
    let A3Commands = fs.readFileSync(fd).toString().split(' ').join('_');
    fs.closeSync(fd);
    let commandsArray = A3Commands.split('\r\n');
    if (commandsArray[commandsArray.length - 1] === '') { commandsArray.pop() };

    for (const element of commandsArray) {
        console.log(element);
        let commandUrl = `https://community.bistudio.com/wiki?title=${element}&printable=yes`;
        let responce = await AxiosInstance.get(commandUrl);
        if (responce) {
            let hover = parseResponce(responce, 'div._description.cmd');
            output[element] = {
                Hover: hover,
                Url: `https://community.bistudio.com/wiki${element}`
            };
        };
    };

    console.log(output);
    let commandsOutPath = `${workingFolderPath}/cfgFunctions/commands.json`;
    if (fs.existsSync(commandsOutPath)) { fs.unlinkSync(commandsOutPath) }
    fd = fs.openSync(commandsOutPath, "a+");
    fs.writeFileSync(fd, JSON.stringify(output));
    fs.closeSync(fd);

};

async function generateFunctions() {
    const AxiosInstance = axios.create();
    let output = {};
    //get array of commands from input file
    let fd = fs.openSync(`${workingFolderPath}/cfgFunctions/functions.txt`, "a+");
    let A3Commands = fs.readFileSync(fd).toString().split(' ').join('_');
    fs.closeSync(fd);
    let commandsArray = A3Commands.split('\r\n');
    if (commandsArray[commandsArray.length - 1] === '') { commandsArray.pop() };

    for (const element of commandsArray) {
        if (!element.includes('_')) { continue }; //Alfabettisation of list
        console.log(element);
        let commandUrl = `https://community.bistudio.com/wiki?title=${element}&printable=yes`;
        let responce = await AxiosInstance.get(commandUrl);
        if (responce) {
            let hover = parseResponce(responce, 'div._description.fnc');
            output[element] = {
                Hover: hover,
                Url: `https://community.bistudio.com/wiki${element}`
            };
        };
    };

    console.log(output);
    let commandsOutPath = `${workingFolderPath}/cfgFunctions/functions.json`;
    if (fs.existsSync(commandsOutPath)) { fs.unlinkSync(commandsOutPath) }
    fd = fs.openSync(commandsOutPath, "a+");
    fs.writeFileSync(fd, JSON.stringify(output));
    fs.closeSync(fd);

};

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.recompile', () => parseDescription(context)));
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.generateCommands', () => generateCommands()));
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.generateFunctions', () => generateFunctions()));

    //events
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((Document) => { onSave(Document) }))

    //unlikely to catch anything...
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
    }))

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        //update config and recompile with new settings
        config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
        updateFolderPaths()
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
    }))

    //commands wiki definitions
    const commandsJsonKeys = Object.keys(commandsJson);
    const functionsJsonKeys = Object.keys(functionsJson);
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'sqf' }, {
        provideDefinition(document, position) {
            let word = document.getText(document.getWordRangeAtPosition(position));

            //case sensetive checks (quick)
            //engine commands
            if (commandsJson[word]) {
                vscode.env.openExternal(commandsJson[word].Url);
                return undefined
            };
            //BIS functions
            if (functionsJson[word]) {
                vscode.env.openExternal(functionsJson[word].Url);
                return undefined
            };

            //custom function
            let key = Object.keys(functionsLib).find((Key) => { return Key.toLowerCase() == word.toLowerCase() });
            if (functionsLib[key]) {
                return new vscode.Location(functionsLib[key].Uri, new vscode.Position(0, 0));
            };

            if (config.get('caseInsensetive')) {
                //engine commands
                key = commandsJsonKeys.find((key) => { return key.toLowerCase() == word.toLowerCase() });
                if (commandsJson[key]) {
                    vscode.env.openExternal(commandsJson[key].Url);
                    return undefined
                };

                //BIS functions
                key = functionsJsonKeys.find((key) => { return key.toLowerCase() == word.toLowerCase() });
                if (functionsJson[key]) {
                    vscode.env.openExternal(functionsJson[key].Url);
                    return undefined
                };
            }

            return undefined
        }
    }));

    //commands wiki hovers (slows down hover loading drastically ~2500 hovers provided)
    if (config.get('EnableCommandsHover')) {
        for (const key in commandsJson) {
            if (Object.prototype.hasOwnProperty.call(commandsJson, key)) {
                const element = commandsJson[key];
                //hovers
                context.subscriptions.push(vscode.languages.registerHoverProvider('sqf', {
                    provideHover(document, position) {
                        const range = document.getWordRangeAtPosition(position);
                        const word = document.getText(range);
                        if (word.toLowerCase() == key.toLowerCase()) {

                            return new vscode.Hover(
                                new vscode.MarkdownString(element.Hover)
                            );
                        };
                    }
                }));
            };
        };
    };

    //functions wiki hovers
    if (config.get('EnableFunctionHover')) {
        for (const key in functionsJson) {
            if (Object.prototype.hasOwnProperty.call(functionsJson, key)) {
                const element = functionsJson[key];
                //hovers
                context.subscriptions.push(vscode.languages.registerHoverProvider('sqf', {
                    provideHover(document, position) {
                        const range = document.getWordRangeAtPosition(position);
                        const word = document.getText(range);
                        if (word.toLowerCase() == key.toLowerCase()) {

                            return new vscode.Hover(
                                new vscode.MarkdownString(element.Hover)
                            );
                        };
                    }
                }));
            };
        };
    };

    //finally auto compile if apropriate
    if (vscode.workspace.workspaceFolders !== undefined) { parseDescription(context) };
}

export function deactivate() {
    disposCompletionItems();
}
