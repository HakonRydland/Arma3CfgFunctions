import * as vscode from 'vscode';
import * as fs from 'fs';
import {parse} from './class-parser';

//completion items regisre
let completionItems = [vscode.Disposable.prototype];
completionItems.pop();
function disposCompletionItems() {
    completionItems.forEach(element => {
        element.dispose();
    });
    completionItems = [];
};

//function Library
let config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
let missionRoot = vscode.workspace.rootPath + '/';
let functionsLib = {}

export function activate(context: vscode.ExtensionContext) {

    let parseDescription = async function () {
        vscode.window.showInformationMessage('Recompiling');

        //working folder
        let workingFolderPath = vscode.workspace.rootPath + '/.vscode';
        if (!fs.existsSync(workingFolderPath)) {
            fs.mkdirSync(workingFolderPath);
        };


        //root description.ext path
        let descriptionPath = '**/*description.ext';
        if (config.has('DescriptionPath')) {
            let path = <string> config.get('DescriptionPath');
            if (path != "") {
                descriptionPath = path.split('\\').join('/');
            };
        }
        console.info(`Description.ext path: ${descriptionPath}`);

        //mission root
        missionRoot = vscode.workspace.rootPath + '/';
        if (config.has("MissionRoot")) {
            let path = vscode.workspace.rootPath + '/' + config.get("MissionRoot");
            if (path != "") {
            missionRoot = path.split('\\').join('/');
            };
        };
        console.info(`Mission Root: ${missionRoot}`);

        let file = await vscode.workspace.findFiles(descriptionPath, "", 1);
        vscode.workspace.openTextDocument(file[0]).then(async (document) => {
            if (document.isDirty) { vscode.window.showInformationMessage(`File unsaved, aborting. | Path: ${descriptionPath}`);};
            //flag declaration
            let cfgFunctionsFound = false;
            let inCfgFunctions = false;
            let brackets = 0;
            console.debug("Parsing flags declaired");

            //create temp file
            fs.writeFileSync(workingFolderPath+"/cfgfunctions", "");
            let fd = fs.openSync(workingFolderPath+"/cfgfunctions", "a+");

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
            let parsedjson = parse(fs.readFileSync(workingFolderPath+"/cfgfunctions").toString());
            fs.unlinkSync(workingFolderPath+"/cfgfunctions");

            functionsLib = generateLibrary(parsedjson);
            console.log(functionsLib);

            //remove old completion items and add new completion items
            disposCompletionItems();
            for (const key in functionsLib) {
                const element = functionsLib[key];
                let disposable = vscode.languages.registerCompletionItemProvider('sqf',{
                    provideCompletionItems(document: vscode.TextDocument, Position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
                        return [
                            new vscode.CompletionItem(element.Name)
                        ]
                    }
                })
                context.subscriptions.push(disposable);
                completionItems.push(disposable);
            };
            vscode.window.showInformationMessage('Recompiled');
        });
    };

    //parses relative path from root path and include line
    function parsePath (currentPath: string, include: string) {
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
            vscode.window.showErrorMessage(`invalid include filepath: ${include}`);
            console.error(`invalid include: ${include}`);
        };

        return ret;
    };

    async function parseFile (fd:number, filePath:string) {
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

    function generateLibrary (cfgFunctionsJSON:JSON) {

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
        };

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
                    const func = Folder[functionName];
                    let functionAtributes = Object.assign( {}, FolderAtributes);

                    //Function traits
                    setPropertyIfExists(func, 'ext', functionAtributes);
                    setPropertyIfExists(func, 'Tag', functionAtributes);
                        //Assign default call name and file path
                    Object.assign(functionAtributes, { Name: functionAtributes.Tag + "_fnc_" + functionName})
                    Object.assign(functionAtributes, { file: functionAtributes.file + "\\fn_" + functionName + functionAtributes.ext });
                    setPropertyIfExists(func, 'file', functionAtributes);

                    //Registre function in library
                    let size = Object.keys(functionLib).length;
                    functionLib[size +1] = functionAtributes;
                }
            }
        };
        return functionLib;
    };

    function PeekFile() {
        const editor = vscode.window.activeTextEditor;
        let selectionStart = editor.selection.start;
        let wordRange = editor.document.getWordRangeAtPosition(selectionStart);
        let selectedText = editor.document.getText(wordRange);

        for (const key in functionsLib) {
            let element = functionsLib[key];
            if (element['Name'] == selectedText) {
                let functionPath = (missionRoot + '/' + element['file']).split('/').join('\\');
                let fncUri = vscode.Uri.file(functionPath);
                vscode.window.showTextDocument(fncUri);
                return
            }
        }
        console.log(selectedText);
    };

    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.recompile', () => {
        parseDescription();
    }));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('a3cfgfunctions.peek', () => {
        PeekFile()
    }));

}

export function deactivate() {
    disposCompletionItems();
}
