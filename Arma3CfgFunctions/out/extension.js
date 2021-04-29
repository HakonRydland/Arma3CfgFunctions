"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
//basics
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
//Arma class parser
const class_parser_1 = require("./class-parser");
//Engine cmd's and BIS function database
const cmd_json_1 = __importDefault(require("./Data/cmd.json"));
const fnc_json_1 = __importDefault(require("./Data/fnc.json"));
const axios_1 = __importDefault(require("axios"));
//axios instance
const axiosInstance = axios_1.default.create();
//base defines
let functionsLib = {};
let config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
let completionItems = [];
//functions
function disposCompletionItems() {
    completionItems.forEach(element => {
        element.dispose();
    });
    completionItems = [];
}
;
let missionRoot = '';
let descriptionPath = '';
let workingFolderPath = '';
function updateFolderPaths() {
    let workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined) {
        return;
    }
    ;
    missionRoot = workspaceFolders[0].uri.fsPath;
    if (config.has("Path.MissionRoot")) {
        missionRoot = (missionRoot + "/" + config.get("Path.MissionRoot")).split('\\').join('/');
    }
    ;
    console.debug("Mission root path: ", missionRoot);
    if (config.has('Path.DescriptionPath')) {
        let path = config.get('Path.DescriptionPath');
        if (path != "") {
            descriptionPath = path.split('\\').join('/');
        }
        else {
            descriptionPath = '**/*description.ext';
        }
        ;
    }
    ;
    console.debug("Description path: ", descriptionPath);
    workingFolderPath = workspaceFolders[0].uri.fsPath.split('\\').join('/') + '/.vscode';
    if (!fs.existsSync(workingFolderPath)) {
        fs.mkdirSync(workingFolderPath);
    }
    ;
    console.debug("Working folder path: ", workingFolderPath);
}
;
if (vscode.workspace.workspaceFolders !== undefined) {
    updateFolderPaths();
}
;
function parseDescription(context) {
    return __awaiter(this, void 0, void 0, function* () {
        let description = yield vscode.workspace.findFiles(descriptionPath, "", 1);
        if (description.length == 0) {
            vscode.window.showWarningMessage("Arma3 CfgFunctions | Can't find description.ext, aborting!");
            return;
        }
        ;
        console.info(`Description.ext path: ${description[0].fsPath}`);
        vscode.workspace.openTextDocument(description[0]).then((document) => __awaiter(this, void 0, void 0, function* () {
            if (document.isDirty) {
                vscode.window.showInformationMessage(`Arma3 CfgFunctions | File unsaved, aborting. | Path: ${descriptionPath}`);
            }
            ;
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
                if (inCfgFunctions && brackets == 0) {
                    continue;
                }
                ;
                if (!cfgFunctionsFound) {
                    cfgFunctionsFound = (element.text.toLowerCase().includes("class cfgfunctions"));
                    if (cfgFunctionsFound) {
                        if (element.text.includes('{')) {
                            brackets += 1;
                        }
                        ;
                        if (element.text.includes('}')) {
                            brackets -= 1;
                        }
                        ;
                    }
                    ;
                }
                else {
                    if (element.text.includes('}')) {
                        brackets -= 1;
                    }
                    ;
                    if (cfgFunctionsFound && brackets > 0) {
                        inCfgFunctions = true;
                        if (element.text.startsWith('//')) {
                            continue;
                        }
                        ;
                        console.debug(`Line: ${element.lineNumber} | Bracket level: ${brackets} | element text: ${element.text}`);
                        if (element.text.search("#include") > -1) {
                            let path = parsePath(missionRoot, element.text);
                            yield parseFile(fd, path);
                        }
                        else {
                            fs.writeFileSync(fd, ('\n' + element.text));
                        }
                        ;
                    }
                    ;
                    if (element.text.includes('{')) {
                        brackets += 1;
                    }
                    ;
                }
                ;
            }
            ;
            fs.closeSync(fd);
            //parse to JSON with external lib and deleteTmpFile
            let parsedjson = class_parser_1.parse(fs.readFileSync(workingFolderPath + "/cfgfunctions.txt").toString());
            fs.unlinkSync(workingFolderPath + "/cfgfunctions.txt");
            functionsLib = yield generateLibrary(parsedjson);
            console.log(functionsLib);
            //reload language additions (auto completion and header hovers)
            reloadLanguageAdditions(context);
        }));
    });
}
;
function parsePath(currentPath, include) {
    let path = currentPath.split('/');
    include = include.split('"')[1];
    let includePath = include.split('\\').join('/').split('/'); // windowns and linux pathing
    for (const step of includePath) {
        if (step == '..') {
            path.pop();
        }
        else {
            path.push(step);
        }
        ;
    }
    ;
    let ret = path.join('/');
    if (!fs.existsSync(ret)) {
        vscode.window.showErrorMessage(`Arma3 CfgFunctions | Invalid include filepath: ${include}`);
        console.error(`invalid include: ${ret}`);
    }
    ;
    return ret;
}
;
function parseFile(fd, filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        let dirPathArray = filePath.split('/');
        dirPathArray.pop();
        let dirPath = dirPathArray.join('/');
        if (!fs.existsSync(filePath)) {
            return 1;
        }
        ;
        console.debug(`parsing file at --> ${filePath}`);
        yield vscode.workspace.openTextDocument(filePath).then((document) => __awaiter(this, void 0, void 0, function* () {
            for (let index = 0; index < document.lineCount; index++) {
                const element = document.lineAt(index);
                if (element.text.startsWith('//')) {
                    continue;
                }
                ;
                if (element.text.search("#include") > -1) {
                    let path = parsePath(dirPath, element.text);
                    yield parseFile(fd, path);
                }
                else {
                    fs.writeFileSync(fd, ('\n' + element.text));
                }
                ;
            }
        }));
    });
}
;
;
function generateLibrary(cfgFunctionsJSON) {
    return __awaiter(this, void 0, void 0, function* () {
        function setPropertyIfExists(object, key, Atributes) {
            if (Object.getOwnPropertyDescriptor(object, key)) {
                Atributes[key] = object[key];
            }
            ;
        }
        ;
        console.log("Generating function lib");
        let functionLib = {};
        //Default attributes
        let MasterAtributes = {
            Name: '',
            NameShort: '',
            Tag: '',
            file: 'functions',
            ext: '.sqf',
            Uri: vscode.Uri.prototype,
            Header: ''
        };
        let atributeKeys = ['tag', 'file', 'ext'];
        let Tagless = config.get('Cfg.Tagless');
        for (const Tag in cfgFunctionsJSON) {
            let NamespaceAtributes = Object.assign({}, MasterAtributes);
            const Namespace = cfgFunctionsJSON[Tag];
            //Namespace traits
            NamespaceAtributes.Tag = Tag;
            setPropertyIfExists(Namespace, 'file', NamespaceAtributes);
            for (const FolderName in Namespace) {
                if (atributeKeys.includes(FolderName.toLowerCase())) {
                    continue;
                }
                ;
                const Folder = Namespace[FolderName];
                let FolderAtributes = Object.assign({}, NamespaceAtributes);
                FolderAtributes.file = `${NamespaceAtributes.file}\\${FolderName}`;
                //Folder traits
                setPropertyIfExists(Folder, 'file', FolderAtributes);
                setPropertyIfExists(Folder, 'Tag', FolderAtributes);
                //Functions
                for (const functionName in Folder) {
                    if (atributeKeys.includes(functionName.toLowerCase())) {
                        continue;
                    }
                    ;
                    const func = Folder[functionName];
                    let functionAtributes = Object.assign({}, FolderAtributes);
                    //Function traits
                    setPropertyIfExists(func, 'ext', functionAtributes);
                    setPropertyIfExists(func, 'Tag', functionAtributes);
                    //Assign default call name and file path
                    functionAtributes.Name = functionAtributes.Tag + "_fnc_" + functionName;
                    functionAtributes.NameShort = functionName;
                    functionAtributes.file = functionAtributes.file + "\\fn_" + functionName + functionAtributes.ext;
                    setPropertyIfExists(func, 'file', functionAtributes);
                    functionAtributes.Uri = vscode.Uri.file(missionRoot + '/' + functionAtributes.file);
                    let Header = yield getHeader(functionAtributes.Uri);
                    functionAtributes.Header = Header;
                    //Registre function in library
                    let name = Tagless ? functionName : functionAtributes.Name;
                    let entrySring = '{"' + name.toLowerCase() + '":' + JSON.stringify(functionAtributes) + '}';
                    let entry = JSON.parse(entrySring);
                    Object.assign(functionLib, entry);
                }
            }
        }
        ;
        return functionLib;
    });
}
;
function getHeader(uri) {
    return __awaiter(this, void 0, void 0, function* () {
        //get text from file
        let text = fs.readFileSync(uri.fsPath).toString();
        if (text === undefined) {
            return "";
        }
        ;
        //find header and extract it
        if (!text.includes('/*')) {
            return "";
        }
        ;
        let header = text.split('/*')[1];
        if (header === undefined) {
            return "";
        }
        header = header.split('*/')[0];
        //trim new line
        if (header == text || header === undefined) {
            return "";
        }
        ;
        if (header.startsWith('\r\n')) {
            header = header.substr(2, header.length);
        }
        if (header.endsWith('\r\n')) {
            header = header.substr(0, header.length - 2);
        }
        //verify we actually have a header
        if (header == text || header === undefined) {
            return "";
        }
        ;
        return header;
    });
}
;
function reloadLanguageAdditions(context) {
    disposCompletionItems();
    if (!config.get('Cfg.DisableAutoComplete')) {
        for (const key in functionsLib) {
            let disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document, Position, token, context) {
                    return [
                        new vscode.CompletionItem(key, 2)
                    ];
                }
            });
            context.subscriptions.push(disposable);
            completionItems.push(disposable);
        }
    }
    if (!config.get('Cfg.DisableHeaderHover')) {
        let disposable = vscode.languages.registerHoverProvider('sqf', {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position);
                const word = document.getText(range).toLowerCase();
                const entry = functionsLib[word];
                if (entry.Header === '')
                    return undefined;
                if (entry !== undefined) {
                    return new vscode.Hover({
                        language: "plaintext",
                        value: entry.Header
                    });
                }
            }
        });
        context.subscriptions.push(disposable);
        completionItems.push(disposable);
    }
}
function onSave(Document) {
    //for Arma header files recompile to catch new or removed functions
    if (Document.languageId == "ext") {
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
        return;
    }
    ;
    //for sqf files only update header of changed file
    if (Document.languageId == "sqf") {
        let nameArray = Document.fileName.split('\\');
        let name = nameArray[nameArray.length - 1];
        name = name.substr(3, name.length - 7); //remove fn_ prefix and .sqf file extension
        (Object.keys(functionsLib)).forEach((Key) => __awaiter(this, void 0, void 0, function* () {
            if (Key.endsWith(name.toLowerCase())) {
                let element = functionsLib[Key];
                let header = yield getHeader(element.Uri);
                element.Header = header;
                return;
            }
            ;
        }));
    }
    ;
}
;
//works but rendering is too simple
function openWebView(cmd) {
    return __awaiter(this, void 0, void 0, function* () {
        const panel = vscode.window.createWebviewPanel('html', "BI Wiki: ".concat(cmd), vscode.ViewColumn.One, {
            enableScripts: true,
            enableFindWidget: true,
            enableCommandUris: true
        });
        const url = `https://community.bistudio.com/wiki?title=${cmd}`;
        axiosInstance.get(url).then(r => { panel.webview.html = r.data; });
    });
}
function openExternalLink(cmd, Url) {
    if (config.get('wiki.useWebview')) {
        openWebView(cmd);
        return;
    }
    vscode.env.openExternal(Url);
}
function goToWiki() {
    let editor = vscode.window.activeTextEditor;
    let document = editor.document;
    let position = editor.selection.active;
    let wordCaseSensitive = document.getText(document.getWordRangeAtPosition(position));
    let word = wordCaseSensitive.toLowerCase();
    console.debug(`Attempting to go to wiki entry for ${word}`);
    //engine commands
    if (cmd_json_1.default[word]) {
        const entry = cmd_json_1.default[word];
        openExternalLink(entry.name, entry.Url);
        return;
    }
    ;
    //BIS functions
    if (fnc_json_1.default[word]) {
        const entry = fnc_json_1.default[word];
        openExternalLink(entry.name, entry.Url);
        return;
    }
    ;
    //blind wiki search
    if (config.get('wiki.allowBlindSearch')) { //toDo make this configuration based
        const Url = `https://community.bistudio.com/wiki/${wordCaseSensitive}`;
        openExternalLink(wordCaseSensitive, vscode.Uri.parse(Url));
        return;
    }
    vscode.window.showInformationMessage(`Can't find wiki entry for ${wordCaseSensitive}`);
}
;
let engineAndBISHovers = [];
function loadEngineAndBISHovers(context) {
    engineAndBISHovers.forEach(element => { element.dispose(); });
    engineAndBISHovers = [];
    if (config.get('Engine.EnableCommandsHover')) {
        const disposable = vscode.languages.registerHoverProvider('sqf', {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position);
                const word = document.getText(range).toLowerCase();
                const entry = cmd_json_1.default[word];
                if (entry !== undefined) {
                    const modifiers = entry.modifiers;
                    const modifierText = modifiers.length > 0 ? modifiers.reduce((prev, cur) => { return `${prev} **${cur}** |`; }, '|') + '\n\n' : '';
                    const firstSyntax = entry.syntaxArray[0];
                    const hover = firstSyntax ? entry.description + '\n\n#### Syntax:\n' + firstSyntax.Syntax + '\n\n' + firstSyntax.Params + '\n\n#### Return:\n' + firstSyntax.Return : entry.description;
                    return new vscode.Hover(new vscode.MarkdownString(modifierText + hover));
                }
            }
        });
        context.subscriptions.push(disposable);
        engineAndBISHovers.push(disposable);
    }
    if (config.get('Engine.EnableFunctionHover')) {
        const disposable = vscode.languages.registerHoverProvider('sqf', {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position);
                const word = document.getText(range).toLowerCase();
                const entry = fnc_json_1.default[word];
                if (entry !== undefined) {
                    const modifiers = entry.modifiers;
                    const modifierText = modifiers.length > 0 ? modifiers.reduce((prev, cur) => { return `${prev} **${cur}** |`; }, '|') + '\n\n' : '';
                    const firstSyntax = entry.syntaxArray[0];
                    const hover = firstSyntax ? entry.description + '\n\n#### Syntax:\n' + firstSyntax.Syntax + '\n\n' + firstSyntax.Params + '\n\n#### Return:\n' + firstSyntax.Return : entry.description;
                    return new vscode.Hover(new vscode.MarkdownString(modifierText + hover));
                }
            }
        });
        context.subscriptions.push(disposable);
        engineAndBISHovers.push(disposable);
    }
}
let engineAndBIScompletions = [];
function loadEngineAndBISCompletion(context) {
    engineAndBIScompletions.forEach(element => { element.dispose(); });
    engineAndBIScompletions = [];
    if (config.get('Engine.enableCommandsAutoComplete')) {
        for (const key in cmd_json_1.default) {
            const entry = cmd_json_1.default[key];
            const disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document, Position, token, context) {
                    let cmpItems = [];
                    for (const syntaxElement of entry.syntaxArray) {
                        let cmpItem = new vscode.CompletionItem(entry.name, 13);
                        let docu = syntaxElement.Syntax + ' --> ' + syntaxElement.Return;
                        cmpItem.documentation = new vscode.MarkdownString(docu);
                        cmpItems.push(cmpItem);
                    }
                    return cmpItems;
                }
            });
            context.subscriptions.push(disposable);
            engineAndBIScompletions.push(disposable);
        }
    }
    if (config.get('Engine.enableFunctionAutoComplete')) {
        for (const key in fnc_json_1.default) {
            const entry = fnc_json_1.default[key];
            const disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document, Position, token, context) {
                    let cmpItems = [];
                    for (const syntaxElement of entry.syntaxArray) {
                        let cmpItem = new vscode.CompletionItem(entry.name, 13);
                        let docu = syntaxElement.Syntax + ' --> ' + syntaxElement.Return;
                        cmpItem.documentation = new vscode.MarkdownString(docu);
                        cmpItems.push(cmpItem);
                    }
                    return cmpItems;
                }
            });
            context.subscriptions.push(disposable);
            engineAndBIScompletions.push(disposable);
        }
    }
}
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.recompile', () => parseDescription(context)));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('a3cfgfunctions.goToWiki', () => goToWiki()));
    //events
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((Document) => { onSave(Document); }));
    //unlikely to catch anything...
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        //update config and recompile with new settings
        config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
        updateFolderPaths();
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
        loadEngineAndBISHovers(context);
        loadEngineAndBISCompletion(context);
    }));
    //custom function definitions
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'sqf' }, {
        provideDefinition(document, position) {
            let word = document.getText(document.getWordRangeAtPosition(position)).toLowerCase();
            //custom function
            if (functionsLib[word]) {
                return new vscode.Location(functionsLib[word].Uri, new vscode.Position(0, 0));
            }
            ;
            return undefined;
        }
    }));
    //extra hovers and auto completion
    loadEngineAndBISHovers(context);
    loadEngineAndBISCompletion(context);
    //finally auto compile if apropriate
    if (vscode.workspace.workspaceFolders !== undefined) {
        parseDescription(context);
    }
    ;
}
exports.activate = activate;
function deactivate() {
    disposCompletionItems();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map