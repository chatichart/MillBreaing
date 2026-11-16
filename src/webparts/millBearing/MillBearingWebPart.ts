import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { Version } from "@microsoft/sp-core-library";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";
import { SPHttpClient } from "@microsoft/sp-http";
import {
  IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneToggle,
} from "@microsoft/sp-property-pane";
import App from "../../components/App";
import {
  SharePointRepository,
  SharePointConfig,
} from "../../repositories/SharePointRepository";
export default class MillBearingWebPart extends BaseClientSideWebPart<SharePointConfig> {
  private root: Root | undefined;
  public render(): void {
    if (!this.root) this.root = createRoot(this.domElement);
    try {
      const siteUrl =
        this.properties.siteUrl || this.context.pageContext.web.absoluteUrl;
      if (
        new URL(siteUrl).origin !==
        new URL(this.context.pageContext.web.absoluteUrl).origin
      )
        throw new Error("SharePoint site must use the current tenant origin");
      const repository = new SharePointRepository(
        { ...this.properties, siteUrl },
        async (url, init) => {
          const headers = new Headers(init?.headers);
          headers.set("OData-Version", "3.0");
          const response = await this.context.spHttpClient.fetch(
            url,
            SPHttpClient.configurations.v1,
            {
              method: init?.method || "GET",
              headers,
              body: init?.body as string,
            },
          );
          return response as unknown as Response;
        },
      );
      this.root.render(
        React.createElement(App, {
          repository,
          user:
            this.context.pageContext.user.loginName ||
            this.context.pageContext.user.displayName,
        }),
      );
    } catch (e) {
      this.root.render(
        React.createElement(
          "div",
          { role: "alert" },
          "กรุณาตั้งค่า Web Part: " + String(e),
        ),
      );
    }
  }
  protected onDispose(): void {
    this.root?.unmount();
  }
  protected get dataVersion(): Version {
    return Version.parse("1.0");
  }
  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description:
              "SharePoint JSON storage — existing Microsoft 365 session",
          },
          groups: [
            {
              groupName: "Storage Configuration",
              groupFields: [
                PropertyPaneTextField("siteUrl", {
                  label: "SHAREPOINT_SITE_URL (blank = current site)",
                }),
                PropertyPaneTextField("libraryPath", {
                  label: "SHAREPOINT_LIBRARY server-relative path",
                }),
                PropertyPaneTextField("dataFolder", {
                  label: "SHAREPOINT_DATA_FOLDER relative to library",
                }),
                PropertyPaneTextField("documentFolder", {
                  label: "SHAREPOINT_DOCUMENT_FOLDER relative to library",
                }),
                PropertyPaneToggle("writerEnabled", {
                  label:
                    "Enable writes ONLY after single-writer / checkout acceptance",
                  onText: "Verified editor enabled",
                  offText: "Read only (safe default)",
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
