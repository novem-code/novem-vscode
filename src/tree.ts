import axios from 'axios';
import * as vscode from 'vscode';

import { UserConfig } from './config';

export class NovemSideBarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private context: vscode.ExtensionContext;
    private type: String;
  
    constructor(context: vscode.ExtensionContext, type:String) {
        this.context = context;
        this.type = type;
    }
    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
          return element;
      }
  
      async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {

          const conf = this.context.globalState.get('userConfig') as UserConfig;
          const token = conf?.token;
  
          if (!token) {
              return [new vscode.TreeItem("Please setup novem by running `novem --init`")];
          }
  
          return axios
              .get(`https://api.novem.no/v1/vis/${this.type}`, {
                  headers: { Authorization: `Bearer ${token}` },
              })
              .then((response) => {
                  console.log(response);
                  return response.data.map((each: any) => new vscode.TreeItem(each.name));
              })
              .catch((error) => {
                  console.log("Error!", !error);
                  return [new vscode.TreeItem("Error loading plots")];
              });
      }
  }