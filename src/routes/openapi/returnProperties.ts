import { schema } from '@bcgsc-pori/graphkb-schema';

const NODE_MODEL_NAMES = schema.getModels().filter((m) => !m.isEdge).map((m) => m.name);

/** *
 * Generate the markdown content to add to the tail of the about.md file which
 * will list all of the possible return properties that can be requested
 */
const generatePropertiesMd = () => {
    const content = [];
    const headingLevel = '###';

    const exclude = [
        'updatedBy',
        'createdBy',
        'deletedBy',
        'createdAt',
        'updatedAt',
        'deletedAt',
        'history',
        'groupRestrictions',
        'comment',
        'uuid',
        '@rid',
        '@class',
    ];

    for (const modelName of NODE_MODEL_NAMES.sort()) {
        const model = schema.get(modelName);

        if (model.isAbstract || model.embedded) {
            continue;
        }

        content.push(`${headingLevel} ${modelName}\n`);

        if (model.description) {
            content.push(`> ${model.description}\n`);
        }
        if (model.inherits.length) {
            content.push(`Inherits from: ${model.inherits.map((i) => `\`${i}\``).join(', ')}\n`);
        }
        const currentProps = Object.values(model.queryProperties)
            .sort((p1, p2) => p1.name.localeCompare(p2.name));

        for (const prop of currentProps) {
            if (exclude.includes(prop.name)) {
                continue;
            }
            let propContent;

            if (prop.linkedClass) {
                propContent = `- **${prop.name}** (*LINK* to \`${prop.linkedClass.name}\`)`;
            } else {
                propContent = `- **${prop.name}**`;
            }

            if (prop.description) {
                propContent = `${propContent}: ${prop.description}`;
            }
            content.push(propContent);
        }
        content.push('');
    }
    return content.join('\n');
};

export { generatePropertiesMd };
