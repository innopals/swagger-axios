import * as readline from 'readline';
// @ts-ignore
import * as Swagger from 'swagger-client';
import { parseArgv } from './config';
import { Spec } from 'swagger-schema-official';
import codegen from './index';

async function run() {
  try {
    const argv = await parseArgv();
    console.log(`Loading spec from "${argv.url}"...`);
    const spec: Spec = (await Swagger(argv.url)).spec;
    console.log(`Using api with title: "${spec.info.title}", description: "${spec.info.description}", version: ${spec.swagger}`);
    if (spec.swagger !== '2.0') {
      console.info("Sorry, only swagger version 2.0 is currently supported.");
      return process.exit(-1);
    }
    if (!argv.force) {
      await new Promise(f => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question(`[Warning] This will wipe out the folder "${argv.out}" and re-generate client code.\nPress [ENTER] to continue or [CTRL+C] to cancel. `, () => {
          rl.close();
          f();
        });
      });
    }
    await codegen(spec, argv);
  } catch (e) {
    console.error("Fail to generate code from api doc, error:", e);
    process.exit(-1);
  }
}

export { run };

if (process.mainModule === module) {
  run();
}
