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
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const class_parser_1 = require("./class-parser");
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = require("cheerio");
const commands_json_1 = __importDefault(require("./Data/commands.json"));
const functions_json_1 = __importDefault(require("./Data/functions.json"));
const commandsJsonKeys = Object.keys(commands_json_1.default);
const functionsJsonKeys = Object.keys(functions_json_1.default);
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
    if (config.has("MissionRoot")) {
        missionRoot = (missionRoot + "/" + config.get("MissionRoot")).split('\\').join('/');
    }
    ;
    console.debug("Mission root path: ", missionRoot);
    if (config.has('DescriptionPath')) {
        let path = config.get('DescriptionPath');
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
                        if (element.text.includes('{')) {
                            brackets += 1;
                        }
                        ;
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
            'Name': "",
            'Tag': "",
            'file': "functions",
            'ext': ".sqf",
            'Uri': vscode.Uri.prototype,
            'Header': ""
        };
        let atributeKeys = ['Tag', 'file', 'ext'];
        for (const Tag in cfgFunctionsJSON) {
            let NamespaceAtributes = Object.assign({}, MasterAtributes);
            const Namespace = cfgFunctionsJSON[Tag];
            //Namespace traits
            NamespaceAtributes.Tag = Tag;
            setPropertyIfExists(Namespace, 'file', NamespaceAtributes);
            console.debug(`Tag: ${Tag}`);
            for (const FolderName in Namespace) {
                const Folder = Namespace[FolderName];
                let FolderAtributes = Object.assign({}, NamespaceAtributes);
                FolderAtributes.file = `${NamespaceAtributes.file}\\${FolderName}`;
                //Folder traits
                setPropertyIfExists(Folder, 'file', FolderAtributes);
                setPropertyIfExists(Folder, 'Tag', FolderAtributes);
                console.debug(`Folder: ${FolderName}`);
                //Functions
                for (const functionName in Folder) {
                    if (atributeKeys.includes(functionName)) {
                        continue;
                    }
                    ;
                    const func = Folder[functionName];
                    let functionAtributes = Object.assign({}, FolderAtributes);
                    console.debug(`Function: ${functionName}`);
                    //Function traits
                    setPropertyIfExists(func, 'ext', functionAtributes);
                    setPropertyIfExists(func, 'Tag', functionAtributes);
                    //Assign default call name and file path
                    Object.assign(functionAtributes, { Name: functionAtributes.Tag + "_fnc_" + functionName });
                    Object.assign(functionAtributes, { file: functionAtributes.file + "\\fn_" + functionName + functionAtributes.ext });
                    setPropertyIfExists(func, 'file', functionAtributes);
                    Object.assign(functionAtributes, { Uri: vscode.Uri.file(missionRoot + '/' + functionAtributes.file) });
                    let Header = yield getHeader(functionAtributes.Uri);
                    Object.assign(functionAtributes, { Header: Header });
                    //Registre function in library
                    let entrySring = '{"' + functionAtributes.Name + '":' + JSON.stringify(functionAtributes) + '}';
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
    if (!config.get('DisableAutoComplete')) {
        for (const key in functionsLib) {
            const element = functionsLib[key];
            let disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document, Position, token, context) {
                    return [
                        new vscode.CompletionItem(element.Name)
                    ];
                }
            });
            context.subscriptions.push(disposable);
            completionItems.push(disposable);
        }
        ;
    }
    ;
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
            }
            ;
        }
        ;
    }
}
;
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
            if (Key.endsWith(name)) {
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
function parseResponce(responce, classID) {
    let $ = cheerio_1.load(responce.data);
    //icon class
    let icons = $('div.locality-icons');
    let locIcons;
    if (icons.length > 0) {
        locIcons = icons[0]['children'];
    }
    ;
    //header contents
    let elements = $(classID)[0]['children'].filter(element => { return element.type == 'tag' && element.name == 'dl'; });
    //parse text
    let commandText = '';
    function addToCommandText(text) { commandText += text; }
    ;
    function parseTypeDT(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) {
                    addToCommandText(element.data);
                }
                ;
            });
        }
    }
    ;
    function extractDataFromTag(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) {
                    addToCommandText(element.data);
                }
                else {
                    extractDataFromTag(element);
                }
                ;
            });
        }
        ;
    }
    ;
    function parseTypeDD(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) {
                    addToCommandText(element.data);
                }
                else {
                    switch (element.name) {
                        case 'code':
                            {
                                addToCommandText('\n```sqf\n');
                                extractDataFromTag(element);
                                addToCommandText('\n```\n');
                                break;
                            }
                            ;
                        case 'a':
                            {
                                parseTypeA(element);
                                break;
                            }
                            ;
                        case 'b':
                            {
                                parseTypeB(element);
                                break;
                            }
                            ;
                        case 'tt':
                            {
                                parseTypeTT(element);
                                break;
                            }
                            ;
                    }
                    ;
                }
                ;
            });
        }
        ;
    }
    ;
    function parseTypeTT(element) {
        if (element.data) {
            addToCommandText(element.data);
        }
        else {
            if (element.children) {
                element.children.forEach(element => { parseTypeTT(element); });
            }
            ;
        }
        ;
    }
    ;
    function parseTypeB(element) {
        element.children.forEach(element => {
            if (element.data) {
                addToCommandText(element.data);
            }
            else {
                switch (element.type) {
                    case 'tag':
                        {
                            extractDataFromTag(element);
                            break;
                        }
                        ;
                    default:
                        {
                            console.warn(`Unknown behaviour parseTypeB() -->`);
                            console.warn(element);
                            break;
                        }
                        ;
                }
                ;
            }
            ;
        });
    }
    ;
    function parseTypeA(element) {
        if (element.children) {
            element.children.forEach(element => {
                if (element.data) {
                    addToCommandText(element.data);
                }
                else {
                    parseTypeA(element);
                }
                ;
            });
        }
        ;
    }
    ;
    function parseTypeDL(element) {
        element.children.forEach(element => {
            if (element.type == 'tag') {
                switch (element.name) {
                    case 'dt':
                        {
                            addToCommandText('\n\n### ');
                            parseTypeDT(element);
                            break;
                        }
                        ;
                    case 'dd':
                        {
                            addToCommandText('\n');
                            parseTypeDD(element);
                            break;
                        }
                        ;
                }
            }
        });
    }
    ;
    if (locIcons) {
        locIcons.forEach(icon => {
            let title = icon['children'][0]['attribs']['title'];
            if (title) {
                addToCommandText(`[${title}]`);
            }
            ;
        });
    }
    ;
    elements.forEach(element => {
        if (element.name == 'dl') {
            parseTypeDL(element);
            addToCommandText('\n');
        }
        else {
            console.warn(`unknown tag name: ${element.name}`);
        }
        ;
    });
    commandText = commandText.substr(0, commandText.search('See also:')).trim();
    return commandText;
}
;
function generateCommands() {
    return __awaiter(this, void 0, void 0, function* () {
        const AxiosInstance = axios_1.default.create();
        let output = {};
        //get array of commands from input file
        let fd = fs.openSync(`${workingFolderPath}/cfgFunctions/commands.txt`, "a+");
        let A3Commands = fs.readFileSync(fd).toString().split(' ').join('_');
        fs.closeSync(fd);
        let commandsArray = A3Commands.split('\r\n');
        if (commandsArray[commandsArray.length - 1] === '') {
            commandsArray.pop();
        }
        ;
        for (const element of commandsArray) {
            console.log(element);
            let commandUrl = `https://community.bistudio.com/wiki?title=${element}&printable=yes`;
            let responce = yield AxiosInstance.get(commandUrl);
            if (responce) {
                let hover = parseResponce(responce, 'div._description.cmd');
                output[element] = {
                    Hover: hover,
                    Url: `https://community.bistudio.com/wiki${element}`
                };
            }
            ;
        }
        ;
        console.log(output);
        let commandsOutPath = `${workingFolderPath}/cfgFunctions/commands.json`;
        if (fs.existsSync(commandsOutPath)) {
            fs.unlinkSync(commandsOutPath);
        }
        fd = fs.openSync(commandsOutPath, "a+");
        fs.writeFileSync(fd, JSON.stringify(output));
        fs.closeSync(fd);
    });
}
;
function generateFunctions() {
    return __awaiter(this, void 0, void 0, function* () {
        const AxiosInstance = axios_1.default.create();
        let output = {};
        //get array of commands from input file
        let fd = fs.openSync(`${workingFolderPath}/cfgFunctions/functions.txt`, "a+");
        let A3Commands = fs.readFileSync(fd).toString().split(' ').join('_');
        fs.closeSync(fd);
        let commandsArray = A3Commands.split('\r\n');
        if (commandsArray[commandsArray.length - 1] === '') {
            commandsArray.pop();
        }
        ;
        for (const element of commandsArray) {
            if (!element.includes('_')) {
                continue;
            }
            ; //Alfabettisation of list
            console.log(element);
            let commandUrl = `https://community.bistudio.com/wiki?title=${element}&printable=yes`;
            let responce = yield AxiosInstance.get(commandUrl);
            if (responce) {
                let hover = parseResponce(responce, 'div._description.fnc');
                output[element] = {
                    Hover: hover,
                    Url: `https://community.bistudio.com/wiki${element}`
                };
            }
            ;
        }
        ;
        console.log(output);
        let commandsOutPath = `${workingFolderPath}/cfgFunctions/functions.json`;
        if (fs.existsSync(commandsOutPath)) {
            fs.unlinkSync(commandsOutPath);
        }
        fd = fs.openSync(commandsOutPath, "a+");
        fs.writeFileSync(fd, JSON.stringify(output));
        fs.closeSync(fd);
    });
}
;
function goToWiki() {
    let editor = vscode.window.activeTextEditor;
    let document = editor.document;
    let position = editor.selection.active;
    let word = document.getText(document.getWordRangeAtPosition(position));
    console.debug(`Attempting to go to wiki entry for ${word}`);
    //case sensetive checks (quick)
    //engine commands
    if (commands_json_1.default[word]) {
        vscode.env.openExternal(commands_json_1.default[word].Url);
        return;
    }
    ;
    //BIS functions
    if (functions_json_1.default[word]) {
        vscode.env.openExternal(functions_json_1.default[word].Url);
        return;
    }
    ;
    if (config.get('caseInsensetive')) {
        //engine commands
        let key = commandsJsonKeys.find((key) => { return key.toLowerCase() == word.toLowerCase(); });
        if (commands_json_1.default[key]) {
            vscode.env.openExternal(commands_json_1.default[key].Url);
            return;
        }
        ;
        //BIS functions
        key = functionsJsonKeys.find((key) => { return key.toLowerCase() == word.toLowerCase(); });
        if (functions_json_1.default[key]) {
            vscode.env.openExternal(functions_json_1.default[key].Url);
            return;
        }
        ;
    }
    vscode.window.showInformationMessage(`Can't find wiki entry for ${word}`);
}
;
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.recompile', () => parseDescription(context)));
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.generateCommands', () => generateCommands()));
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.generateFunctions', () => generateFunctions()));
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
    }));
    //custom function definitions
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'sqf' }, {
        provideDefinition(document, position) {
            let word = document.getText(document.getWordRangeAtPosition(position));
            //custom function
            let key = Object.keys(functionsLib).find((Key) => { return Key.toLowerCase() == word.toLowerCase(); });
            if (functionsLib[key]) {
                return new vscode.Location(functionsLib[key].Uri, new vscode.Position(0, 0));
            }
            ;
            return undefined;
        }
    }));
    //commands wiki hovers (slows down hover loading drastically ~2500 hovers provided)
    if (config.get('EnableCommandsHover')) {
        for (const key in commands_json_1.default) {
            if (Object.prototype.hasOwnProperty.call(commands_json_1.default, key)) {
                const element = commands_json_1.default[key];
                //hovers
                context.subscriptions.push(vscode.languages.registerHoverProvider('sqf', {
                    provideHover(document, position) {
                        const range = document.getWordRangeAtPosition(position);
                        const word = document.getText(range);
                        if (word.toLowerCase() == key.toLowerCase()) {
                            return new vscode.Hover(new vscode.MarkdownString(element.Hover));
                        }
                        ;
                    }
                }));
            }
            ;
        }
        ;
    }
    ;
    //functions wiki hovers
    if (config.get('EnableFunctionHover')) {
        for (const key in functions_json_1.default) {
            if (Object.prototype.hasOwnProperty.call(functions_json_1.default, key)) {
                const element = functions_json_1.default[key];
                //hovers
                context.subscriptions.push(vscode.languages.registerHoverProvider('sqf', {
                    provideHover(document, position) {
                        const range = document.getWordRangeAtPosition(position);
                        const word = document.getText(range);
                        if (word.toLowerCase() == key.toLowerCase()) {
                            return new vscode.Hover(new vscode.MarkdownString(element.Hover));
                        }
                        ;
                    }
                }));
            }
            ;
        }
        ;
    }
    ;
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