
import {getQueryableProps, displayQuery} from './util';
import { parse } from './parse';
import { GraphRecord, ModelType } from '@bcgsc-pori/graphkb-schema/dist/types';
import {ClassModel} from '@bcgsc-pori/graphkb-schema';
/**
 * Given some input record, create a query to find it
 *
 * @param {ClassModel} model the model/class to query
 * @param {object} record the record content
 *
 */
const parseRecord = (model: ModelType, record: GraphRecord, { activeIndexOnly = false, ...opt }: Record<string,unknown> = {}) => {
    const query: {
        filters: {AND: unknown[]},
        target: string | string[];
        [key: string]: unknown
    } = { ...opt, filters: { AND: [] }, target: model.name };

    if (record['@rid']) {
        query.target = [record['@rid']];
        query.model = model.name;
    }

    const filters = query.filters.AND;
    const content = { ...record };

    const activeIndexProps = model.getActiveProperties();
    const properties = Object.values(model.properties).filter(
        (prop) => !activeIndexOnly || (activeIndexProps && activeIndexProps.includes(prop.name)),
    );

    for (const prop of properties.sort((a, b) => a.name.localeCompare(b.name))) {
        if (content[prop.name] === undefined) {
            if (!activeIndexOnly) {
                continue;
            } else {
                content[prop.name] = null; // nulls are included in the active index
            }
        }
        if (prop.type.includes('embedded') && prop.linkedClass && content[prop.name]) {
            for (const [propKey, subprop] of Object.entries(getQueryableProps(prop.linkedClass as ClassModel)).sort()) {  // TODO: change after adjusting schema types
                const propChain = `${prop.name}.${propKey}`;
                const value = content[prop.name][subprop.name];

                if (value !== undefined) {
                    filters.push({ [propChain]: value });
                }
            }
        } else {
            filters.push({ [prop.name]: content[prop.name] });
        }
    }
    const result = parse(query);
    return result;
};

export {
    parse, parseRecord, displayQuery
};
