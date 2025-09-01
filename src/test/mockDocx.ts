/* eslint-disable @typescript-eslint/no-explicit-any */
import { mock, instance } from "ts-mockito";
import type { TextRun, Paragraph, Table, TableRow, TableCell } from "docx";

type Ctor<T> = new (...args: any[]) => T;

interface RecordingCtor<T> {
    /** New-able fake constructor */
    Ctor: Ctor<T>;
    /** Every argument list passed to `new` */
    calls: any[][];
    /** Instances returned (ts-mockito instances) in call order */
    instances: T[];
    /** Underlying ts-mockito mocks for each returned instance */
    mocks: any[];
}

/**
 * Create a new-able constructor that records all constructor info and returns
 * a new ts-mockito instance each time.
 *
 * Each new mock object records its called args in its `__ctorArgs` attribute.
 *
 * @param realClass The class to be mocked.
 * @returns A new-able constructor along with captured calls, instances, and mocks.
 */
function createRecordingCtor<T>(realClass: Ctor<T>): RecordingCtor<T> {
    const calls: any[][] = [];
    const instances: T[] = [];
    const mocks: any[] = [];

    const Fake: any = function (...args: any[]): T {
        calls.push(args);
        const m = mock<T>(realClass);
        const inst = instance(m);
        mocks.push(m);
        instances.push(inst);
        // Attach constructor args directly to the returned object
        (inst as any).__ctorArgs = args;
        return inst;
    };

    // Readable name for stack traces
    try {
        Object.defineProperty(Fake, "name", {
            value: `Mock${realClass.name}`,
            configurable: true,
        });
    } catch {
        // ignore
    }

    // Fake the constructor funk
    return { Ctor: Fake as Ctor<T>, calls, instances, mocks };
}

/**
 * Create a mocked docx module.
 *
 * @param realDocx Module object from the actual docx library.
 * @returns The mocked docx module object and recorders.
 */
export function createDocxModuleMock(realDocx: {
    TextRun: Ctor<TextRun>;
    Paragraph: Ctor<Paragraph>;
    Table: Ctor<Table>;
    TableRow: Ctor<TableRow>;
    TableCell: Ctor<TableCell>;
}) {
    const textRunRec = createRecordingCtor(realDocx.TextRun);
    const paragraphRec = createRecordingCtor(realDocx.Paragraph);
    const tableRec = createRecordingCtor(realDocx.Table);
    const rowRec = createRecordingCtor(realDocx.TableRow);
    const cellRec = createRecordingCtor(realDocx.TableCell);

    const docxMock = {
        TextRun: textRunRec.Ctor,
        Paragraph: paragraphRec.Ctor,
        Table: tableRec.Ctor,
        TableRow: rowRec.Ctor,
        TableCell: cellRec.Ctor,
    };

    return {
        docxMock,
        recorders: {
            TextRun: textRunRec,
            Paragraph: paragraphRec,
            Table: tableRec,
            TableRow: rowRec,
            TableCell: cellRec,
        },
    };
}
