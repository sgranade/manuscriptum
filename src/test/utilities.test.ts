import { expect } from "chai";
import "mocha";

import * as uut from "../utilities";

describe("Utilities", () => {
    describe("Folder to Output Filename", () => {
        it("should turn a name into a dash-separated lower-cased filename", () => {
            // No arrange

            const result = uut.folderNameToDocxOutfileName(
                "Example Folder Name"
            );

            expect(result).to.equal("example-folder-name.docx");
        });

        it("should remove forbidden Windows characters", () => {
            // No arrange

            const result = uut.folderNameToDocxOutfileName(
                '*LOOK* <Example>: "Folder| /Name\\?'
            );

            expect(result).to.equal("look-example-folder-name.docx");
        });

        it("should truncate a name that's longer than 32 characters at the first space short of that limit", () => {
            // No arrange

            const result = uut.folderNameToDocxOutfileName(
                "Example Folder Name That Is Maybeeeee Too Long"
            );

            expect(result).to.equal("example-folder-name-that-is.docx");
        });

        it("should be okay with a name that's longer than 32 characters with no spaces", () => {
            // No arrange

            const result = uut.folderNameToDocxOutfileName(
                "Example-Folder-Name-That-Is-Maybe-Too-Long"
            );

            expect(result).to.equal(
                "example-folder-name-that-is-maybe-too-long.docx"
            );
        });
    });
});
